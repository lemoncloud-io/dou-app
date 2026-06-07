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
    // Server's authoritative older-cursor (mirrors apps/web useChats): the next
    // page is fetched with `cursorNo`, and the engine returns `cursorNo <= 1` once
    // no older history remains. Trust it instead of guessing from page length.
    const [feedCursorNo, setFeedCursorNo] = useState<number | undefined>(undefined);
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
            setFeedCursorNo(undefined);
            setIsLoadingOlder(false);
            return;
        }

        setLive(null);
        setOlder([]);
        setFeedCursorNo(undefined);
        setIsLoadingOlder(false);

        const unsubscribe = chatRepository.subscribeList(channelId, result => setLive(result?.list ?? []));

        // Kick a network fetch so the cache (and thus the subscription) is populated.
        void chatRepository
            .fetchChat({ channelId, limit: PAGE_SIZE }, { cachePolicy: 'cache-first' })
            .then(result => {
                if (channelId === channelIdRef.current) setFeedCursorNo(result.meta?.cursorNo);
            })
            .catch(() => undefined);

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
