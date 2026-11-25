import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { logger } from '@chatic/bridges';
import type { DomainChat } from '@chatic/runtime-react';

import { runtime } from '@chatic/runtime-react';

import { compareByChatNo } from '../utils/chatSort';

const PAGE_SIZE = 50;
const LOAD_MORE_SIZE = 50;
const EMPTY_SETTLE_MS = 600;
const UNVERIFIED_CEILING_MS = 4000;

interface ChannelWindow {
    pageLimit: number;
    hasMore: boolean;
}
const channelMemo = new Map<string, ChannelWindow>();

const sortByChatNo = (messages: DomainChat[]): DomainChat[] => [...messages].sort(compareByChatNo);

export const useChats = (channelId: string | null, latestChatNo?: number, options: { persist?: boolean } = {}) => {
    const { persist = true } = options;
    const { chat: chatRepository } = runtime.data.useRuntimeRepositories();
    const { userId: myUid } = runtime.session.useSessionIdentity();
    const { selectedCloudId } = runtime.session.useSessionSelection();

    const { prime, retryPrime } = runtime.sync.useChatSync(channelId ?? undefined);
    const { isVerified } = runtime.connection.useRuntimeSocketState();

    const scopeKey = channelId ? `${selectedCloudId ?? 'default'}:${myUid ?? ''}:${channelId}` : null;
    const initial = scopeKey ? channelMemo.get(scopeKey) : undefined;
    const [chats, setChats] = useState<DomainChat[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [pageLimit, setPageLimit] = useState(initial?.pageLimit ?? PAGE_SIZE);
    const [hasMore, setHasMore] = useState(initial?.hasMore ?? true);
    const [isLoadingOlder, setIsLoadingOlder] = useState(false);
    const [loadOlderFailed, setLoadOlderFailed] = useState(false);

    const channelIdRef = useRef(channelId);
    const chatsRef = useRef<DomainChat[]>(chats);
    chatsRef.current = chats;
    const pageLimitRef = useRef(pageLimit);
    pageLimitRef.current = pageLimit;
    const latestChatNoRef = useRef(latestChatNo);
    latestChatNoRef.current = latestChatNo;
    const readBackLimitRef = useRef(0);
    const askingRef = useRef<string | null>(null);
    const floorRef = useRef<{ scope: string | null; no: number }>({ scope: null, no: 0 });

    const [renderedScope, setRenderedScope] = useState(scopeKey);
    if (renderedScope !== scopeKey) {
        setRenderedScope(scopeKey);
        const restored = scopeKey ? channelMemo.get(scopeKey) : undefined;
        setChats([]);
        setIsLoading(true);
        setPageLimit(restored?.pageLimit ?? PAGE_SIZE);
        setHasMore(restored?.hasMore ?? true);
        setIsLoadingOlder(false);
        setLoadOlderFailed(false);
    }

    useEffect(() => {
        channelIdRef.current = channelId;
    }, [channelId]);

    useEffect(() => {
        if (scopeKey && persist) channelMemo.set(scopeKey, { pageLimit, hasMore });
    }, [scopeKey, pageLimit, hasMore, persist]);

    useEffect(() => {
        if (!channelId) {
            setChats([]);
            setIsLoading(false);
            return;
        }
        let cancelled = false;
        const unsubscribe = chatRepository.observeList({ channelId, limit: pageLimit, includeUnsent: true }, result => {
            if (cancelled) return;
            readBackLimitRef.current = pageLimit;
            setChats(result?.list ?? []);
            setIsLoading(false);
        });
        return () => {
            cancelled = true;
            unsubscribe();
        };
    }, [chatRepository, channelId, pageLimit, myUid, selectedCloudId]);

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
            if (freshnessRef.current === target) freshnessRef.current = { id: null, no: 0 };
            logger.warn('CHAT', '[useChats] freshness refresh failed; will retry on the next chance', {
                channelId,
                latestChatNo,
                error,
            });
        });
    }, [chatRepository, channelId, latestChatNo, chats]);

    const messages = useMemo(() => sortByChatNo(chats), [chats]);

    const [emptySettled, setEmptySettled] = useState<{ scope: string; as: 'empty' | 'failed' } | null>(null);
    const coldWait = !!scopeKey && !isLoading && chats.length === 0 && prime !== 'failed';
    const waitsOnSocket = prime === 'pending' && !isVerified;
    useEffect(() => {
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

    const loadOlder = useCallback(async (): Promise<boolean> => {
        if (!channelId || isLoadingOlder || !hasMore) return true;
        if (askingRef.current === scopeKey || readBackLimitRef.current < pageLimitRef.current) return true;
        let oldestNo = Infinity;
        for (const chat of chatsRef.current) {
            if (chat.chatNo != null && chat.chatNo > 0 && chat.chatNo < oldestNo) oldestNo = chat.chatNo;
        }
        if (floorRef.current.scope === scopeKey && floorRef.current.no > 0) {
            oldestNo = Math.min(oldestNo, floorRef.current.no);
        }
        if (!Number.isFinite(oldestNo) && latestChatNoRef.current) oldestNo = latestChatNoRef.current + 1;
        if (!Number.isFinite(oldestNo)) return true;

        const reqChannel = channelId;
        const reqScope = scopeKey;
        askingRef.current = reqScope;
        setLoadOlderFailed(false);
        setIsLoadingOlder(true);
        try {
            let cursorNo = oldestNo;
            for (;;) {
                const result = await chatRepository.refreshList({
                    channelId: reqChannel,
                    cursorNo,
                    limit: LOAD_MORE_SIZE,
                });
                if (reqChannel !== channelIdRef.current) return true;
                const next = result.cursorNo ?? 0;
                if (next > 0) floorRef.current = { scope: reqScope, no: next };
                if (result.fetchedCount > 0) {
                    setPageLimit(prev => prev + LOAD_MORE_SIZE);
                    if (result.cursorNo === 0) setHasMore(false);
                    return true;
                }
                if (next <= 0 || next >= cursorNo) {
                    setHasMore(false);
                    return true;
                }
                cursorNo = next;
            }
        } catch {
            if (reqChannel === channelIdRef.current) setLoadOlderFailed(true);
            return false;
        } finally {
            if (askingRef.current === reqScope) askingRef.current = null;
            if (reqChannel === channelIdRef.current) setIsLoadingOlder(false);
        }
    }, [chatRepository, channelId, scopeKey, isLoadingOlder, hasMore]);

    const canPage = !!latestChatNo || chats.some(chat => !!chat.chatNo && chat.chatNo > 0);

    return {
        messages,
        isLoading: feedLoading,
        loadFailed,
        retryLoad,
        loadOlder,
        loadOlderFailed,
        hasMore: hasMore && canPage,
        isLoadingOlder,
    };
};
