import { useCallback, useEffect, useMemo, useState } from 'react';

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

    useEffect(() => {
        if (!channelId) {
            setLive([]);
            setOlder([]);
            setHasMore(false);
            return;
        }

        setLive(null);
        setOlder([]);
        setHasMore(true);

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
        if (!oldest || oldest <= 1) {
            setHasMore(false);
            return;
        }
        setIsLoadingOlder(true);
        try {
            const result = await chatRepository.fetchChat(
                { channelId, cursorNo: oldest, limit: PAGE_SIZE },
                { cachePolicy: 'network-only' }
            );
            const list = result.list ?? [];
            setOlder(prev => mergeUnique(prev, list));
            if (list.length < PAGE_SIZE) setHasMore(false);
        } catch {
            // Leave hasMore set so a later scroll retries.
        } finally {
            setIsLoadingOlder(false);
        }
    }, [channelId, chatRepository, messages, isLoadingOlder, hasMore]);

    return {
        messages,
        isLoading: live === null,
        loadOlder,
        hasMore,
        isLoadingOlder,
    };
};
