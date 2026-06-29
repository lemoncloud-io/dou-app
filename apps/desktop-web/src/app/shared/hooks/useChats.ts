import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { DomainChat } from '@chatic/data';

import { useChatSync, useRuntimeRepositories } from '@chatic/app-runtime';

const PAGE_SIZE = 50;
// Each older page widens the observe window by this much. `observeList` returns
// only the newest `limit` rows (chat_no-descending cursor paging), so revealing
// older history means growing the window to re-include the freshly cached page.
const LOAD_MORE_SIZE = 50;

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

const sortByChatNo = (messages: DomainChat[]): DomainChat[] =>
    [...messages].sort((a, b) => {
        const aNo = a.chatNo ?? Number.MAX_SAFE_INTEGER;
        const bNo = b.chatNo ?? Number.MAX_SAFE_INTEGER;
        if (aNo !== bNo) return aNo - bNo;
        return (a.createdAt ?? 0) - (b.createdAt ?? 0);
    });

/**
 * Message stream for a channel (mirrors apps/web useChats). Chat fetching is owned
 * by the sync layer — `useChatSync` registers a 'chat' target and the SyncManager
 * seeds the first page (when the cache is cold) and streams live + catches up on
 * reconnect — so this hook never fetches on entry; it only observes the cache.
 * `loadOlder` fetches the next older page by cursor and widens the window so the
 * cache re-emits with the older page included. Rows are sorted oldest→newest.
 */
export const useChats = (channelId: string | null) => {
    const { chat: chatRepository } = useRuntimeRepositories();

    useChatSync(channelId ?? undefined);

    const initial = channelId ? channelMemo.get(channelId) : undefined;
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
    const [renderedChannel, setRenderedChannel] = useState(channelId);
    if (renderedChannel !== channelId) {
        setRenderedChannel(channelId);
        const restored = channelId ? channelMemo.get(channelId) : undefined;
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
        if (channelId) channelMemo.set(channelId, { pageLimit, hasMore });
    }, [channelId, pageLimit, hasMore]);

    // Widening pageLimit re-subscribes and re-reads cached older pages into view.
    useEffect(() => {
        if (!channelId) {
            setChats([]);
            setIsLoading(false);
            return;
        }
        return chatRepository.observeList({ channelId, limit: pageLimit }, result => {
            setChats(result?.list ?? []);
            setIsLoading(false);
        });
    }, [chatRepository, channelId, pageLimit]);

    const messages = useMemo(() => sortByChatNo(chats), [chats]);

    const loadOlder = useCallback(async () => {
        if (!channelId || isLoadingOlder || !hasMore) return;
        // Read the oldest cached row from the ref so the cursor reflects the live
        // list without making `chats` a dependency. observeList is chat_no-descending,
        // so the smallest chatNo is the page boundary to fetch before.
        let oldestNo = Infinity;
        for (const chat of chatsRef.current) {
            if (chat.chatNo != null && chat.chatNo < oldestNo) oldestNo = chat.chatNo;
        }
        if (!Number.isFinite(oldestNo)) return;

        const reqChannel = channelId;
        setIsLoadingOlder(true);
        try {
            const result = await chatRepository.refreshList({
                channelId: reqChannel,
                cursorNo: oldestNo,
                limit: LOAD_MORE_SIZE,
            });
            // Channel switched while the request was in flight — drop the result.
            if (reqChannel !== channelIdRef.current) return;
            if (result.fetchedCount === 0) setHasMore(false);
            else setPageLimit(prev => prev + LOAD_MORE_SIZE);
        } catch {
            // Leave hasMore set so a later scroll retries.
        } finally {
            if (reqChannel === channelIdRef.current) setIsLoadingOlder(false);
        }
    }, [chatRepository, channelId, isLoadingOlder, hasMore]);

    return {
        messages,
        isLoading,
        loadOlder,
        hasMore,
        isLoadingOlder,
    };
};
