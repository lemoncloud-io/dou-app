import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { DomainChat } from '@chatic/data';

import { useRuntimeRepositories } from '@chatic/app-runtime';

const PAGE_SIZE = 50;

/**
 * Session-scoped, in-memory memo of each channel's loaded state — the live tail
 * page, the scrolled-up `older` history, and the pagination cursor. NOT a
 * parallel store: it only mirrors what the engine already streamed/fetched, so
 * re-opening a channel restores exactly what was on screen (including history
 * you scrolled up to load) instead of reloading from scratch. Never persisted;
 * the engine cache stays the source of truth.
 */
interface ChannelState {
    live: DomainChat[] | null;
    older: DomainChat[];
    feedCursorNo?: number;
}
const channelMemo = new Map<string, ChannelState>();

const sortByChatNo = (messages: DomainChat[]) =>
    [...messages].sort((a, b) => {
        const aNo = a.chatNo ?? Number.MAX_SAFE_INTEGER;
        const bNo = b.chatNo ?? Number.MAX_SAFE_INTEGER;
        if (aNo !== bNo) return aNo - bNo;
        return (a.createdAt ?? 0) - (b.createdAt ?? 0);
    });

const keyOf = (m: DomainChat): string => m.id ?? m.tempId ?? String(m.chatNo);

/** Merge message lists, de-duplicating by id/tempId/chatNo, sorted oldest→newest. */
const mergeUnique = (...lists: DomainChat[][]): DomainChat[] => {
    const map = new Map<string, DomainChat>();
    for (const list of lists) for (const m of list) map.set(keyOf(m), m);
    return sortByChatNo([...map.values()]);
};

/**
 * Message stream for a channel. The engine's local subscription streams the
 * latest page live (GlobalChatSync drives background sync). `subscribeList` is
 * capped at the most recent page, so older history fetched on scroll-up is held
 * separately and merged in — live tail + accumulated history, de-duplicated.
 */
export const useChats = (channelId: string | null) => {
    const { chat: chatRepository } = useRuntimeRepositories();
    const initial = channelId ? channelMemo.get(channelId) : undefined;
    const [live, setLive] = useState<DomainChat[] | null>(() => (channelId ? (initial?.live ?? null) : []));
    const [older, setOlder] = useState<DomainChat[]>(() => initial?.older ?? []);
    // Server's authoritative older-cursor (mirrors apps/web useChats): the next
    // page is fetched with `cursorNo`, and the engine returns `cursorNo <= 1` once
    // no older history remains. Trust it instead of guessing from page length.
    const [feedCursorNo, setFeedCursorNo] = useState<number | undefined>(initial?.feedCursorNo);
    const [isLoadingOlder, setIsLoadingOlder] = useState(false);
    // Tracks the channel the hook is currently bound to, so an in-flight
    // loadOlder() that resolves after a channel switch can bail instead of
    // merging the previous channel's history into the new one.
    const channelIdRef = useRef(channelId);

    // Adjust state synchronously when the channel changes (React's "derive state
    // from props" pattern) so the new channel paints in the same render. Restore
    // the full saved state — live tail + scrolled-up history + cursor — so a
    // revisited channel shows exactly what was there, with no loading skeleton or
    // re-scroll; a never-opened one resets to a fresh load.
    const [renderedChannel, setRenderedChannel] = useState(channelId);
    if (renderedChannel !== channelId) {
        setRenderedChannel(channelId);
        const restored = channelId ? channelMemo.get(channelId) : undefined;
        setLive(channelId ? (restored?.live ?? null) : []);
        setOlder(restored?.older ?? []);
        setFeedCursorNo(restored?.feedCursorNo);
        setIsLoadingOlder(false);
    }

    // Persist the channel's loaded state so re-opening restores it instead of
    // reloading. Keeps the scrolled-up history and pagination cursor across switches.
    // Skip the null (not-yet-loaded) state so it never overwrites a saved entry.
    useEffect(() => {
        if (channelId && live !== null) channelMemo.set(channelId, { live, older, feedCursorNo });
    }, [channelId, live, older, feedCursorNo]);

    useEffect(() => {
        channelIdRef.current = channelId;
        if (!channelId) return;

        const unsubscribe = chatRepository.subscribeList(channelId, result => setLive(result?.list ?? []));

        // Only hit the network the first time this channel is opened this session.
        // On revisit the cached pages are restored from memo and the socket keeps
        // the live tail fresh, so skip the redundant reload.
        if (!channelMemo.get(channelId)?.live) {
            void chatRepository
                .fetchChat({ channelId, limit: PAGE_SIZE }, { cachePolicy: 'cache-first' })
                .then(result => {
                    if (channelId === channelIdRef.current) setFeedCursorNo(result.meta?.cursorNo);
                })
                .catch(() => undefined);
        }

        return () => unsubscribe();
    }, [channelId, chatRepository]);

    const messages = useMemo(() => mergeUnique(live ?? [], older), [live, older]);

    const hasMore = feedCursorNo !== undefined && feedCursorNo > 1;

    const loadOlder = useCallback(async () => {
        if (!channelId || isLoadingOlder || feedCursorNo === undefined || feedCursorNo <= 1) return;
        const reqChannel = channelId;
        setIsLoadingOlder(true);
        try {
            const result = await chatRepository.fetchChat(
                { channelId: reqChannel, cursorNo: feedCursorNo, limit: PAGE_SIZE },
                { cachePolicy: 'network-only' }
            );
            // Channel switched while the request was in flight — drop the result.
            if (reqChannel !== channelIdRef.current) return;
            setOlder(prev => mergeUnique(prev, result.list ?? []));
            setFeedCursorNo(result.meta?.cursorNo);
        } catch {
            // Leave feedCursorNo set so a later scroll retries.
        } finally {
            if (reqChannel === channelIdRef.current) setIsLoadingOlder(false);
        }
    }, [channelId, chatRepository, feedCursorNo, isLoadingOlder]);

    return {
        messages,
        isLoading: live === null,
        loadOlder,
        hasMore,
        isLoadingOlder,
    };
};
