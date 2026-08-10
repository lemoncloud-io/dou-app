import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useChatSync, useRuntimeRepositories } from '@chatic/app-runtime';
import { useSessionIdentity } from '@chatic/web-core';
import type { DomainChat, DomainUser } from '@chatic/data';

import { isFeedVisible, isOwnSystemChat } from '../../../utils';
import type { ClientChatView } from '../types';
import { useForegroundChatRefresh } from './useForegroundChatRefresh';

// Each older page widens the observe window by this much. `observeList` returns
// only the newest `limit` rows (chat_no-descending cursor paging), so to reveal
// older history the window must grow to re-include the freshly cached page.
const LOAD_MORE_SIZE = 50;

// Extra rows kept around a jump target so it lands with context above it rather than flush at the
// very edge of the window.
const JUMP_WINDOW_PADDING = 20;

interface UseChatsParams {
    channelId: string;
    limit: number;
}

/** Build the uid → display-name map used to resolve a message owner's name. */
const nameOf = (chat: DomainChat, userMap: Map<string, DomainUser>): string =>
    userMap.get(chat.ownerId ?? '')?.name ?? chat.owner$?.name ?? chat.ownerId ?? '';

/**
 * Message stream for a channel. Observes the newest `pageLimit` rows; `loadMore`
 * fetches the next older page by cursor and widens the window so the cache
 * re-emits with the older page included (testbed's paging model). Domain rows
 * are mapped to `ClientChatView` (owner identity, parsed timestamp, flags),
 * sorted oldest → newest so the last element is the latest message.
 */
export const useChats = ({ channelId, limit }: UseChatsParams) => {
    const { chat: chatRepository, user: userRepository } = useRuntimeRepositories();
    const { userId } = useSessionIdentity();
    const myUid = userId ?? '';

    // Chat fetching is owned by the sync layer: useChatSync registers a 'chat' target, and
    // SyncManager.primeChatTarget seeds the initial page (refreshList when the cache is cold)
    // while ChatSyncPlan streams live + catches up on reconnect. So this hook never fetches on
    // entry itself — it only observes the cache (no isVerified gate needed here).
    useChatSync(channelId);
    // Warm-cache complement: pushes missed while backgrounded leave no recovery path (the chat
    // plan doesn't poll), so warm rooms refetch the newest page on entry and foreground return.
    useForegroundChatRefresh(channelId);

    const [chats, setChats] = useState<DomainChat[]>([]);
    const [users, setUsers] = useState<DomainUser[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [isError, setIsError] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [pageLimit, setPageLimit] = useState(limit);
    // A jump widens the window on its own axis. Kept separate from `pageLimit` so it cannot disturb
    // `isThreadStartLoaded`, which reads "the cache could not fill the page" as "nothing older".
    const [jumpLimit, setJumpLimit] = useState(0);
    const observeLimit = Math.max(pageLimit, jumpLimit);

    // Latest chats snapshot for loadMore — keeps the callback identity stable (a `chats`/`messages`
    // dependency would rebuild loadMore on every live message append, re-attaching scroll listeners).
    const chatsRef = useRef<DomainChat[]>(chats);
    chatsRef.current = chats;
    // Read inside loadUntil without making it depend on (and churn with) the window size.
    const observeLimitRef = useRef(observeLimit);
    observeLimitRef.current = observeLimit;

    // Reset paging/scroll guards on channel change or window-size change — treat it as a fresh entry.
    useEffect(() => {
        setChats([]);
        setIsLoading(true);
        setHasMore(true);
        setPageLimit(limit);
        setJumpLimit(0);
    }, [channelId, limit]);

    // Widening pageLimit re-subscribes and re-reads cached older pages into view.
    useEffect(() => {
        if (!channelId) return;
        return chatRepository.observeList({ channelId, limit: observeLimit }, result => {
            setChats(result?.list ?? []);
            setIsLoading(false);
        });
    }, [chatRepository, channelId, observeLimit]);

    // Member identity for owner-name fallback (best-effort; cache stream persists).
    useEffect(() => {
        if (!channelId) return;
        return userRepository.observeList({ channelId }, result => setUsers(result?.list ?? []));
    }, [userRepository, channelId]);

    const userMap = useMemo(() => {
        const map = new Map<string, DomainUser>();
        for (const user of users) if (user.id) map.set(user.id, user);
        return map;
    }, [users]);

    // Sort oldest → newest so messages[last] is the latest (the page reads it for auto-read).
    // Pending/failed (optimistic) rows have no server chatNo yet — they must sort AFTER all
    // committed rows (i.e. as the newest, at the bottom), not at chatNo 0 which would pin them to
    // the top. So a missing/zero chatNo is treated as +Infinity, with createdAt as the tiebreak
    // (multiple pending rows, or a pending vs. its just-committed twin).
    // Own system rows (my join/leave) are hidden — they carry no information for their subject.
    // Read-marking is unaffected: stage 1 of useReadMarker sends channel.chatNo, which already
    // covers a hidden newest row.
    // isFeedVisible additionally drops reaction events (they fold into chips — as rows they were
    // the empty-pill bug ADR-0045 fixes) and thread replies (they live on the thread page).
    const messages = useMemo<ClientChatView[]>(() => {
        const sortKey = (chat: DomainChat): number =>
            chat.chatNo && chat.chatNo > 0 ? chat.chatNo : Number.POSITIVE_INFINITY;
        return chats
            .filter(chat => !isOwnSystemChat(chat, myUid) && isFeedVisible(chat))
            .sort((a, b) => {
                const aNo = sortKey(a);
                const bNo = sortKey(b);
                if (aNo !== bNo) return aNo - bNo;
                return (a.createdAtMs ?? 0) - (b.createdAtMs ?? 0);
            })
            .map(chat => ({
                ...chat,
                isOwner: !!chat.ownerId && chat.ownerId === myUid,
                isSystem: chat.stereo === 'system',
                ownerName: nameOf(chat, userMap),
                timestamp: new Date(chat.createdAtMs ?? chat.createdAt ?? 0),
            }));
    }, [chats, userMap, myUid]);

    const loadMore = useCallback(async () => {
        if (!channelId || isLoadingMore || !hasMore) return;
        // Read the oldest cached row from the ref so the cursor reflects the live list without
        // making `chats` a dependency. observeList is chat_no-descending, so the smallest chatNo
        // is the page boundary to fetch before.
        let oldestNo = Infinity;
        for (const chat of chatsRef.current) {
            if (chat.chatNo != null && chat.chatNo < oldestNo) oldestNo = chat.chatNo;
        }
        if (!Number.isFinite(oldestNo)) return;

        setIsLoadingMore(true);
        try {
            const result = await chatRepository.refreshList({
                channelId,
                cursorNo: oldestNo,
                limit: LOAD_MORE_SIZE,
            });
            if (result.fetchedCount === 0) {
                setHasMore(false);
            } else {
                setPageLimit(prev => prev + LOAD_MORE_SIZE);
            }
        } catch {
            setIsError(true);
        } finally {
            setIsLoadingMore(false);
        }
    }, [chatRepository, channelId, isLoadingMore, hasMore]);

    /**
     * Widens the observe window so a cached message at `targetNo` comes into view — the jump path
     * (useMessageJump). This reads the CACHE only: `loadMore` fetches one 50-row page from the
     * server per call, so reaching a message a few hundred rows back took more round trips than the
     * jump budget allows, and the jump gave up on a message that was sitting in the cache all along.
     *
     * Returns true when the window actually grew, i.e. it is worth waiting for the re-render.
     * False means the window already covers that far back, so the row genuinely isn't cached and
     * the caller should fall back to paging.
     */
    const loadUntil = useCallback((targetNo: number): boolean => {
        if (!Number.isFinite(targetNo) || targetNo <= 0) return false;

        let newestNo = 0;
        for (const chat of chatsRef.current) {
            if (chat.chatNo != null && chat.chatNo > newestNo) newestNo = chat.chatNo;
        }
        if (newestNo <= targetNo) return false;

        // chatNo is one sequence over user + system messages, so its distance is an upper bound on
        // the rows in between — an over-estimate only shows more cached rows, never fewer.
        const needed = newestNo - targetNo + JUMP_WINDOW_PADDING;
        if (needed <= observeLimitRef.current) return false;

        setJumpLimit(needed);
        return true;
    }, []);

    return {
        messages,
        /**
         * The unfiltered cache window. Reaction folding and thread derivation MUST read
         * this list — `messages` has the reaction events and replies filtered out, so
         * deriving from it would silently yield nothing (ADR-0045).
         */
        rawChats: chats,
        isLoading,
        isEmpty: !isLoading && messages.length === 0,
        isLoadingMore,
        isError,
        hasMore,
        /**
         * The oldest loaded row really is the thread's first, so anything anchored to the start of
         * the conversation can render.
         *
         * No longer read by the room: the intro keys off holding `chatNo === 1`, which is proof
         * rather than inference and never flips back as pages land. Kept as the paging fact it
         * describes — and because it is the only thing that pins the jumpLimit / pageLimit split
         * below to an observable outcome.
         *
         * `!hasMore` alone is not enough: it only turns false once a `loadMore` comes back empty,
         * and a thread shorter than the viewport never overflows — so the scroll listener never
         * fires one and `hasMore` stays true forever. A page the cache could not fill is the other
         * way to know there is nothing older. Kept separate from `hasMore` on purpose: a short
         * cache during hydration must not disable pagination.
         */
        isThreadStartLoaded: !hasMore || chats.length < pageLimit,
        loadMore,
        loadUntil,
    };
};
