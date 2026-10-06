import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { logger } from '@chatic/bridges';
import type { DomainChat } from '@chatic/data';

import { runtime } from '@chatic/app-runtime';

import { compareByChatNo } from '../utils/chatSort';

const PAGE_SIZE = 50;
// Each older page widens the observe window by this much. `observeList` returns
// only the newest `limit` rows (chat_no-descending cursor paging), so revealing
// older history means growing the window to re-include the freshly cached page.
const LOAD_MORE_SIZE = 50;
// The prime reports its first page written once the cache write resolves, but the list observer
// re-reads after that — so an empty list is only trusted after this settle window, the same one the
// sidebar gives its channel list.
const EMPTY_SETTLE_MS = 600;
// A socket wedged after a sleep/wake never verifies, so the prime never runs. Past this the feed
// stops waiting and offers a retry instead of a skeleton that spins for good.
const UNVERIFIED_CEILING_MS = 4000;

/**
 * Session-scoped, in-memory memo of each channel's expanded observe window and
 * whether older history is exhausted. NOT a parallel store: it only records how
 * far the user paged so re-opening a channel restores the same scroll depth
 * (mirrors apps/web's growing-window paging) instead of resetting to one page.
 * The engine cache stays the source of truth; this is never persisted.
 */
interface ChannelWindow {
    pageLimit: number;
    hasMore: boolean;
}
const channelMemo = new Map<string, ChannelWindow>();

const sortByChatNo = (messages: DomainChat[]): DomainChat[] => [...messages].sort(compareByChatNo);

/**
 * Message stream for a channel (mirrors apps/web useChats). Chat fetching is owned
 * by the sync layer — `runtime.sync.useChatSync` registers a 'chat' target and the SyncManager
 * seeds the first page (when the cache is cold) — plus the freshness bridge below;
 * `loadOlder` fetches the next older page by cursor and widens the window so the
 * cache re-emits with the older page included. Rows are sorted oldest→newest.
 *
 * `latestChatNo` is the channel record's newest message number (lastChatNoOf).
 * It is the feed's only RELIABLE freshness signal: the engine's chat sync cannot
 * deliver mid-session messages — the live sync frame arrives as `channel.sync`
 * (routed to the channel target only), the chat plan's periodic `run()` is a
 * no-op, and its `onConnected` catch-up never fires for a target registered
 * while already connected. The channel record, by contrast, is kept live by the
 * channel plan's poll — so when it runs ahead of the cache, fetch the newest page.
 *
 * `persist: false` keeps this instance from saving its window depth (see the first line of the hook).
 *
 * `isLoading` holds over an empty cache until the room's prime settles: a cold room reads empty
 * before its first page lands, and taking that at its word showed the "write the first message"
 * intro over a room that had messages. `loadFailed` is that first page failing (or never starting,
 * on a socket that does not verify), with `retryLoad` to try again.
 */
export const useChats = (channelId: string | null, latestChatNo?: number, options: { persist?: boolean } = {}) => {
    // A second consumer of the same channel (the thread panel) starts from the depth the room remembers
    // but must not save its own: paging a thread's replies back would otherwise widen the room the next
    // time it opens.
    const { persist = true } = options;
    const { chat: chatRepository } = runtime.data.useRuntimeRepositories();
    // Part of the cache observer's scope key ({cid, uid}); channel ids are per-cloud and
    // collide across clouds, so uid is what keeps the feed bound to the right partition.
    const { userId: myUid } = runtime.session.useSessionIdentity();

    const { prime, retryPrime } = runtime.sync.useChatSync(channelId ?? undefined);
    const { isVerified } = runtime.connection.useRuntimeSocketState();

    // Memo/reset key, not just the channel id: the same id names different channels in
    // different clouds, and uid is what separates their cache partitions.
    const scopeKey = channelId ? `${myUid ?? ''}:${channelId}` : null;
    const initial = scopeKey ? channelMemo.get(scopeKey) : undefined;
    const [chats, setChats] = useState<DomainChat[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [pageLimit, setPageLimit] = useState(initial?.pageLimit ?? PAGE_SIZE);
    const [hasMore, setHasMore] = useState(initial?.hasMore ?? true);
    const [isLoadingOlder, setIsLoadingOlder] = useState(false);

    // Tracks the channel the hook is bound to, so an in-flight loadOlder() that
    // resolves after a channel switch can bail instead of paging the wrong channel.
    const channelIdRef = useRef(channelId);
    // Latest chats for loadOlder's cursor — keeps the callback identity stable (a
    // `chats` dependency would rebuild it on every live append, re-attaching listeners).
    const chatsRef = useRef<DomainChat[]>(chats);
    chatsRef.current = chats;

    // Adjust state synchronously on channel switch (React's "derive state from
    // props" pattern) so the new channel paints in the same render. Restore the
    // saved window so a revisited channel shows its prior scroll depth.
    const [renderedScope, setRenderedScope] = useState(scopeKey);
    if (renderedScope !== scopeKey) {
        setRenderedScope(scopeKey);
        const restored = scopeKey ? channelMemo.get(scopeKey) : undefined;
        setChats([]);
        setIsLoading(true);
        setPageLimit(restored?.pageLimit ?? PAGE_SIZE);
        setHasMore(restored?.hasMore ?? true);
        setIsLoadingOlder(false);
    }

    useEffect(() => {
        channelIdRef.current = channelId;
    }, [channelId]);

    // Persist the channel's window so re-opening restores its scroll depth.
    useEffect(() => {
        if (scopeKey && persist) channelMemo.set(scopeKey, { pageLimit, hasMore });
    }, [scopeKey, pageLimit, hasMore, persist]);

    // Widening pageLimit re-subscribes and re-reads cached older pages into view.
    useEffect(() => {
        if (!channelId) {
            setChats([]);
            setIsLoading(false);
            return;
        }
        // Ignore a read that resolves after this subscription is torn down — the engine's
        // unsubscribe does not cancel one already in flight, so the outgoing channel's (or
        // cloud's) messages would land in the pane the incoming one just painted.
        let cancelled = false;
        // `includeUnsent` — desktop opt-in. Without it, `chat_no: 0` rows (sending / failed) sort
        // lowest in the pagination index and fall off a newest-N page, so in any channel holding
        // `pageLimit` committed messages a failed message never renders: no "Not delivered", no
        // retry button. `apps/web` does not pass the flag, so its read path is unchanged.
        const unsubscribe = chatRepository.observeList({ channelId, limit: pageLimit, includeUnsent: true }, result => {
            if (cancelled) return;
            setChats(result?.list ?? []);
            setIsLoading(false);
        });
        return () => {
            cancelled = true;
            unsubscribe();
        };
    }, [chatRepository, channelId, pageLimit, myUid]);

    // Freshness bridge (see the hook doc): when the channel record's newest chatNo
    // runs ahead of what the cache holds, pull the newest feed page. Guarded per
    // (channel, chatNo) so an already-fetched target (e.g. a deleted or
    // thread-only message the feed can't surface) isn't re-fetched every render. A fetch that
    // FAILED gives its guard back, so the next run of this effect (a cache emission, a newer
    // latestChatNo, a reopened room) tries the same target again; nothing here re-runs it by
    // itself, so a persistent failure costs one request per such chance, not a loop.
    const freshnessRef = useRef<{ id: string | null; no: number }>({ id: null, no: 0 });
    useEffect(() => {
        if (!channelId || !latestChatNo) return;
        let cachedNewest = 0;
        for (const chat of chats) {
            if (chat.chatNo != null && chat.chatNo > cachedNewest) cachedNewest = chat.chatNo;
        }
        if (latestChatNo <= cachedNewest) return;
        if (freshnessRef.current.id === channelId && freshnessRef.current.no >= latestChatNo) return;
        const target = { id: channelId, no: latestChatNo };
        freshnessRef.current = target;
        chatRepository.refreshList({ channelId, limit: PAGE_SIZE }).catch((error: unknown) => {
            // Only the guard this fetch set: a newer target has already replaced it, and reopening
            // that one would refetch a page that may have landed.
            if (freshnessRef.current === target) freshnessRef.current = { id: null, no: 0 };
            logger.warn('CHAT', '[useChats] freshness refresh failed; will retry on the next chance', {
                channelId,
                latestChatNo,
                error,
            });
        });
    }, [chatRepository, channelId, latestChatNo, chats]);

    const messages = useMemo(() => sortByChatNo(chats), [chats]);

    // How an empty room settled: trusted as empty, or given up on. Keyed by scope so the next room
    // starts unsettled. A populated list never reads it.
    const [emptySettled, setEmptySettled] = useState<{ scope: string; as: 'empty' | 'failed' } | null>(null);
    const coldWait = !!scopeKey && !isLoading && chats.length === 0 && prime !== 'failed';
    const waitsOnSocket = prime === 'pending' && !isVerified;
    useEffect(() => {
        // A verified socket's pending prime is a fetch in flight: it settles by itself, no timer.
        if (!coldWait || !scopeKey || (prime === 'pending' && !waitsOnSocket)) return;
        const as = prime === 'ready' ? 'empty' : 'failed';
        const timer = setTimeout(
            () => setEmptySettled({ scope: scopeKey, as }),
            as === 'empty' ? EMPTY_SETTLE_MS : UNVERIFIED_CEILING_MS
        );
        return () => clearTimeout(timer);
    }, [coldWait, scopeKey, prime, waitsOnSocket]);
    const settledAs = emptySettled?.scope === scopeKey ? emptySettled.as : null;
    const loadFailed =
        !!scopeKey &&
        !isLoading &&
        chats.length === 0 &&
        (prime === 'failed' || (prime === 'pending' && settledAs === 'failed'));
    const feedLoading = isLoading || (coldWait && !loadFailed && !(prime === 'ready' && settledAs === 'empty'));

    const retryLoad = useCallback(() => {
        setEmptySettled(null);
        retryPrime();
    }, [retryPrime]);

    // Resolves false only when the page fetch failed — everything else (nothing to load, a channel
    // switch, a page that landed) is not an error. The thread panel pages by this, and a failure it
    // cannot see would read as a thread that never finishes loading.
    const loadOlder = useCallback(async (): Promise<boolean> => {
        if (!channelId || isLoadingOlder || !hasMore) return true;
        // Read the oldest cached row from the ref so the cursor reflects the live
        // list without making `chats` a dependency. observeList is chat_no-descending,
        // so the smallest chatNo is the page boundary to fetch before.
        //
        // Skip `chatNo: 0` — that sentinel means "not sent yet", not "oldest". Since the list now
        // carries unsent rows (includeUnsent above), letting one win here would ask the server for
        // everything before chat_no 0, which is nothing: `fetchedCount === 0` sets hasMore false
        // and load-more dies permanently.
        let oldestNo = Infinity;
        for (const chat of chatsRef.current) {
            if (chat.chatNo != null && chat.chatNo > 0 && chat.chatNo < oldestNo) oldestNo = chat.chatNo;
        }
        if (!Number.isFinite(oldestNo)) return true;

        const reqChannel = channelId;
        setIsLoadingOlder(true);
        try {
            const result = await chatRepository.refreshList({
                channelId: reqChannel,
                cursorNo: oldestNo,
                limit: LOAD_MORE_SIZE,
            });
            // Channel switched while the request was in flight — drop the result.
            if (reqChannel !== channelIdRef.current) return true;
            if (result.fetchedCount === 0) setHasMore(false);
            else setPageLimit(prev => prev + LOAD_MORE_SIZE);
            return true;
        } catch {
            // Leave hasMore set so a later scroll retries.
            return false;
        } finally {
            if (reqChannel === channelIdRef.current) setIsLoadingOlder(false);
        }
    }, [chatRepository, channelId, isLoadingOlder, hasMore]);

    return {
        messages,
        isLoading: feedLoading,
        loadFailed,
        retryLoad,
        loadOlder,
        hasMore,
        isLoadingOlder,
    };
};
