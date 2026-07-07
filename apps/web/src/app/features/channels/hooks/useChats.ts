import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useChatSync, useRuntimeRepositories } from '@chatic/app-runtime';
import { useSessionIdentity } from '@chatic/web-core';
import type { DomainChat, DomainUser } from '@chatic/data';

import { isOwnSystemChat } from '../../../utils';
import type { ClientChatView } from '../types';
import { useForegroundChatRefresh } from './useForegroundChatRefresh';

// Each older page widens the observe window by this much. `observeList` returns
// only the newest `limit` rows (chat_no-descending cursor paging), so to reveal
// older history the window must grow to re-include the freshly cached page.
const LOAD_MORE_SIZE = 50;

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

    // Latest chats snapshot for loadMore — keeps the callback identity stable (a `chats`/`messages`
    // dependency would rebuild loadMore on every live message append, re-attaching scroll listeners).
    const chatsRef = useRef<DomainChat[]>(chats);
    chatsRef.current = chats;

    // Reset paging/scroll guards on channel change or window-size change — treat it as a fresh entry.
    useEffect(() => {
        setChats([]);
        setIsLoading(true);
        setHasMore(true);
        setPageLimit(limit);
    }, [channelId, limit]);

    // Widening pageLimit re-subscribes and re-reads cached older pages into view.
    useEffect(() => {
        if (!channelId) return;
        return chatRepository.observeList({ channelId, limit: pageLimit }, result => {
            setChats(result?.list ?? []);
            setIsLoading(false);
        });
    }, [chatRepository, channelId, pageLimit]);

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
    // Own system rows (my join/leave) are hidden — they carry no information for their subject.
    // Read-marking is unaffected: stage 1 of useReadMarker sends channel.chatNo, which already
    // covers a hidden newest row.
    const messages = useMemo<ClientChatView[]>(() => {
        return chats
            .filter(chat => !isOwnSystemChat(chat, myUid))
            .sort((a, b) => (a.chatNo ?? 0) - (b.chatNo ?? 0))
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

    return {
        messages,
        isLoading,
        isEmpty: !isLoading && messages.length === 0,
        isLoadingMore,
        isError,
        hasMore,
        loadMore,
    };
};
