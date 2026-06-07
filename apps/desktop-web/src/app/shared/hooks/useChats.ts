import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { DomainChat } from '@chatic/data';

import { useRepositories } from '@chatic/app-runtime';

const PAGE_SIZE = 50;

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
    const { chat: chatRepository } = useRepositories();
    const [live, setLive] = useState<DomainChat[] | null>(null);
    const [older, setOlder] = useState<DomainChat[]>([]);
    const [hasMore, setHasMore] = useState(true);
    const [isLoadingOlder, setIsLoadingOlder] = useState(false);
    // Tracks the channel the hook is currently bound to, so an in-flight
    // loadOlder() that resolves after a channel switch can bail instead of
    // merging the previous channel's history into the new one.
    const channelIdRef = useRef(channelId);

    useEffect(() => {
        channelIdRef.current = channelId;
        if (!channelId) {
            setLive([]);
            setOlder([]);
            setHasMore(false);
            setIsLoadingOlder(false);
            return;
        }

        setLive(null);
        setOlder([]);
        setHasMore(true);
        setIsLoadingOlder(false);

        const unsubscribe = chatRepository.subscribeList(channelId, result => setLive(result?.list ?? []));

        // Kick a network fetch so the cache (and thus the subscription) is populated.
        void chatRepository
            .fetchChat({ channelId, limit: PAGE_SIZE }, { cachePolicy: 'cache-first' })
            .then(result => {
                if ((result.list?.length ?? 0) < PAGE_SIZE) setHasMore(false);
            })
            .catch(() => undefined);

        return () => unsubscribe();
    }, [channelId, chatRepository]);

    const messages = useMemo(() => mergeUnique(live ?? [], older), [live, older]);

    const loadOlder = useCallback(async () => {
        if (!channelId || isLoadingOlder || !hasMore) return;
        const oldest = messages[0]?.chatNo;
        if (!oldest) {
            setHasMore(false);
            return;
        }
        const reqChannel = channelId;
        setIsLoadingOlder(true);
        try {
            const result = await chatRepository.fetchChat(
                { channelId: reqChannel, cursorNo: oldest, limit: PAGE_SIZE },
                { cachePolicy: 'network-only' }
            );
            // Channel switched while the request was in flight — drop the result.
            if (reqChannel !== channelIdRef.current) return;
            const list = result.list ?? [];
            const merged = mergeUnique(older, list);
            // Stop when a short page came back OR the page added nothing new (a full
            // page of duplicates would otherwise re-fetch the same cursor forever).
            if (list.length < PAGE_SIZE || merged.length === older.length) setHasMore(false);
            setOlder(merged);
        } catch {
            // Leave hasMore set so a later scroll retries.
        } finally {
            if (reqChannel === channelIdRef.current) setIsLoadingOlder(false);
        }
    }, [channelId, chatRepository, messages, older, isLoadingOlder, hasMore]);

    return {
        messages,
        isLoading: live === null,
        loadOlder,
        hasMore,
        isLoadingOlder,
    };
};
