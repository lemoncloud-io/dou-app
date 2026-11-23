import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
    runtime,
    isInJoinWindow,
    uncoveredIn,
    type DomainChat,
    type DomainUser,
    type FeedRange,
} from '@chatic/runtime';

import { useSelectedCloudId } from '../../../hooks/useCloudScope';
import { isFeedVisible, isOwnSystemChat } from '../../../utils';
import type { ClientChatView } from '../types';
import { useChannelHeadRefresh } from './useChannelHeadRefresh';
import { useForegroundChatRefresh } from './useForegroundChatRefresh';

const LOAD_MORE_SIZE = 50;

const JUMP_WINDOW_PADDING = 20;

const LOAD_MORE_RETRY_BASE_MS = 2000;
const LOAD_MORE_RETRY_MAX_MS = 30000;

const WINDOW_LAND_TIMEOUT_MS = 5000;

const RUN_STARTED_AT = Date.now();

const GAP_DIVIDER_MIN_MISSING = 11;

const NOTHING_COVERED: readonly FeedRange[] = [];

const NO_CHATS: DomainChat[] = [];

export interface ChatGap {
    olderNo: number;
    newerNo: number;
    missing: number;
}

export type ChatGapSide = 'newer' | 'older';

export const chatGapKey = (gap: Pick<ChatGap, 'olderNo' | 'newerNo'>): string => `${gap.olderNo}-${gap.newerNo}`;

export interface LoadMoreOptions {
    immediate?: boolean;
}

interface UseChatsParams {
    channelId: string;
    limit: number;
    joinedNo?: number;
    readingHistoryRef?: { readonly current: boolean };
    channelChatNo?: number;
}

const nameOf = (chat: DomainChat, userMap: Map<string, DomainUser>): string =>
    userMap.get(chat.ownerId ?? '')?.name ?? chat.owner$?.name ?? chat.ownerId ?? '';

export const useChats = ({ channelId, limit, joinedNo, readingHistoryRef, channelChatNo }: UseChatsParams) => {
    const { chat: chatRepository, user: userRepository } = runtime.data.useRuntimeRepositories();
    const { userId } = runtime.session.useSessionIdentity();
    const { isVerified } = runtime.connection.useRuntimeSocketState();
    const myUid = userId ?? '';

    runtime.sync.useChatSync(channelId);
    useForegroundChatRefresh(channelId);

    const [cachedChats, setCachedChats] = useState<DomainChat[]>([]);
    const [windowChannelId, setWindowChannelId] = useState<string | null>(null);
    const [users, setUsers] = useState<DomainUser[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [pageLimit, setPageLimit] = useState(limit);
    const [jumpLimit, setJumpLimit] = useState(0);
    const observeLimit = Math.max(pageLimit, jumpLimit);
    const [isBackingOff, setIsBackingOff] = useState(false);
    const cid = useSelectedCloudId();
    const uid = runtime.session.useUidInCloud(cid);
    const coverageKey = channelId ? `${cid}|${uid ?? ''}|${channelId}` : null;
    const [coverage, setCoverage] = useState<{ key: string; covered: readonly FeedRange[] } | null>(null);
    const coveredRef = useRef<readonly FeedRange[]>(NOTHING_COVERED);
    const covered = coverage && coverage.key === coverageKey ? coverage.covered : NOTHING_COVERED;

    useEffect(() => {
        coveredRef.current = NOTHING_COVERED;
        if (!coverageKey) return;
        return chatRepository.observeFeedCoverage(channelId, next => {
            coveredRef.current = next;
            setCoverage({ key: coverageKey, covered: next });
        });
    }, [chatRepository, channelId, coverageKey]);
    const [gapStatus, setGapStatus] = useState<ReadonlyMap<string, 'loading' | 'failed'>>(new Map());
    const rangeInFlightRef = useRef(new Set<number>());

    const loadingMoreRef = useRef(false);
    const awaitingLimitRef = useRef<number | null>(null);
    const landTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const pendingPageRef = useRef<{ cursorNo: number; isLast: boolean } | null>(null);
    const lastCursorRef = useRef<number | null>(null);
    const failuresRef = useRef(0);
    const backingOffRef = useRef(false);
    const retryTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const newestNoRef = useRef(0);
    const generationRef = useRef(0);

    const isOtherChannelWindow = windowChannelId !== null && windowChannelId !== channelId;
    const windowChats = isOtherChannelWindow ? NO_CHATS : cachedChats;
    const isWindowLoading = isLoading || isOtherChannelWindow;
    const chats = useMemo(() => windowChats.filter(chat => isInJoinWindow(chat, joinedNo)), [windowChats, joinedNo]);

    const cachedNewestNo = useMemo(
        () => windowChats.reduce((max, chat) => (chat.chatNo && chat.chatNo > max ? chat.chatNo : max), 0),
        [windowChats]
    );
    useChannelHeadRefresh({
        channelId,
        channelChatNo,
        cachedNewestNo,
        isCacheRead: !isLoading && windowChannelId === channelId,
    });

    const chatsRef = useRef<DomainChat[]>(chats);
    chatsRef.current = chats;
    const observeLimitRef = useRef(observeLimit);
    observeLimitRef.current = observeLimit;
    const pageLimitRef = useRef(pageLimit);
    pageLimitRef.current = pageLimit;
    const jumpLimitRef = useRef(jumpLimit);
    jumpLimitRef.current = jumpLimit;

    const growWindow = useCallback((rows: number) => {
        if (jumpLimitRef.current > pageLimitRef.current) setJumpLimit(prev => prev + rows);
        else setPageLimit(prev => prev + rows);
    }, []);

    const releasePaging = useCallback(() => {
        awaitingLimitRef.current = null;
        pendingPageRef.current = null;
        clearTimeout(landTimerRef.current);
        loadingMoreRef.current = false;
        setIsLoadingMore(false);
    }, []);

    const settlePage = useCallback(() => {
        const page = pendingPageRef.current;
        if (page) {
            lastCursorRef.current = page.cursorNo;
            if (page.isLast) setHasMore(false);
        }
        releasePaging();
    }, [releasePaging]);

    const endBackoff = useCallback(() => {
        failuresRef.current = 0;
        clearTimeout(retryTimerRef.current);
        backingOffRef.current = false;
        setIsBackingOff(false);
    }, []);

    useEffect(() => {
        generationRef.current += 1;
        setCachedChats([]);
        setWindowChannelId(null);
        setIsLoading(true);
        setHasMore(true);
        setPageLimit(limit);
        setJumpLimit(0);
        releasePaging();
        endBackoff();
        lastCursorRef.current = null;
        newestNoRef.current = 0;
        rangeInFlightRef.current = new Set();
        setGapStatus(new Map());
    }, [channelId, limit, releasePaging, endBackoff]);

    useEffect(
        () => () => {
            generationRef.current += 1;
            clearTimeout(landTimerRef.current);
            clearTimeout(retryTimerRef.current);
        },
        []
    );

    useEffect(() => {
        if (!channelId) return;
        return chatRepository.observeList({ channelId, limit: observeLimit }, result => {
            const list = result?.list ?? [];
            setCachedChats(list);
            setWindowChannelId(channelId);
            setIsLoading(false);

            let newestNo = 0;
            for (const chat of list) if (chat.chatNo && chat.chatNo > newestNo) newestNo = chat.chatNo;
            const previousNewestNo = newestNoRef.current;
            if (newestNo > previousNewestNo) {
                newestNoRef.current = newestNo;
                const isReadingHistory = readingHistoryRef ? readingHistoryRef.current : true;
                if (previousNewestNo > 0 && observeLimit > limit && isReadingHistory) {
                    let arrived = 0;
                    for (const chat of list) if (chat.chatNo && chat.chatNo > previousNewestNo) arrived += 1;
                    growWindow(arrived);
                }
            }

            if (awaitingLimitRef.current !== null && observeLimit >= awaitingLimitRef.current) settlePage();
        });
    }, [chatRepository, channelId, observeLimit, limit, readingHistoryRef, growWindow, settlePage]);

    useEffect(() => {
        if (!channelId) return;
        return userRepository.observeList({ channelId }, result => setUsers(result?.list ?? []));
    }, [userRepository, channelId]);

    const userMap = useMemo(() => {
        const map = new Map<string, DomainUser>();
        for (const user of users) if (user.id) map.set(user.id, user);
        return map;
    }, [users]);

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

    const loadMore = useCallback(
        async ({ immediate = false }: LoadMoreOptions = {}) => {
            if (!channelId || !isVerified || !hasMore || loadingMoreRef.current) return;
            if (backingOffRef.current && !immediate) return;
            let oldestNo = Infinity;
            for (const chat of chatsRef.current) {
                if (chat.chatNo && chat.chatNo > 0 && chat.chatNo < oldestNo) oldestNo = chat.chatNo;
            }
            if (!Number.isFinite(oldestNo)) return;
            if (oldestNo <= (joinedNo ?? 0) + 1) {
                setHasMore(false);
                return;
            }
            if (oldestNo === lastCursorRef.current) {
                setHasMore(false);
                return;
            }

            const generation = generationRef.current;
            loadingMoreRef.current = true;
            setIsLoadingMore(true);

            const pageLow = Math.max(1, oldestNo - LOAD_MORE_SIZE);
            if (uncoveredIn(coveredRef.current, pageLow, oldestNo - 1).length === 0) {
                const below = await chatRepository
                    .cacheReadList({ channelId, cursorNo: oldestNo, limit: 1 })
                    .catch(() => null);
                if (generation !== generationRef.current) return;
                if ((below?.list?.[0]?.chatNo ?? 0) >= pageLow) {
                    pendingPageRef.current = { cursorNo: oldestNo, isLast: pageLow <= (joinedNo ?? 0) + 1 };
                    awaitingLimitRef.current = observeLimitRef.current + LOAD_MORE_SIZE;
                    growWindow(LOAD_MORE_SIZE);
                    clearTimeout(landTimerRef.current);
                    landTimerRef.current = setTimeout(releasePaging, WINDOW_LAND_TIMEOUT_MS);
                    return;
                }
            }

            try {
                const result = await chatRepository.refreshList(
                    { channelId, cursorNo: oldestNo, limit: LOAD_MORE_SIZE },
                    { cursorIsRow: true }
                );
                if (generation !== generationRef.current) return;
                endBackoff();
                if (result.fetchedCount === 0) {
                    setHasMore(false);
                    releasePaging();
                    return;
                }
                pendingPageRef.current = { cursorNo: oldestNo, isLast: result.cursorNo === 0 };
                awaitingLimitRef.current = observeLimitRef.current + result.fetchedCount;
                growWindow(result.fetchedCount);
                clearTimeout(landTimerRef.current);
                landTimerRef.current = setTimeout(releasePaging, WINDOW_LAND_TIMEOUT_MS);
            } catch {
                if (generation !== generationRef.current) return;
                failuresRef.current += 1;
                const wait = Math.min(LOAD_MORE_RETRY_MAX_MS, LOAD_MORE_RETRY_BASE_MS * 2 ** (failuresRef.current - 1));
                backingOffRef.current = true;
                setIsBackingOff(true);
                clearTimeout(retryTimerRef.current);
                retryTimerRef.current = setTimeout(() => {
                    backingOffRef.current = false;
                    setIsBackingOff(false);
                }, wait);
                releasePaging();
            }
        },
        [chatRepository, channelId, hasMore, isBackingOff, isVerified, joinedNo, growWindow, releasePaging, endBackoff]
    );

    const loadUntil = useCallback((targetNo: number): boolean => {
        if (!Number.isFinite(targetNo) || targetNo <= 0) return false;

        let newestNo = 0;
        for (const chat of chatsRef.current) {
            if (chat.chatNo != null && chat.chatNo > newestNo) newestNo = chat.chatNo;
        }
        if (newestNo <= targetNo) return false;

        const needed = newestNo - targetNo + JUMP_WINDOW_PADDING;
        if (needed <= observeLimitRef.current) return false;

        setJumpLimit(prev => Math.max(prev, needed));
        return true;
    }, []);

    const gaps = useMemo<ChatGap[]>(() => {
        const numbers = chats
            .map(chat => chat.chatNo)
            .filter((chatNo): chatNo is number => !!chatNo && chatNo > 0)
            .sort((a, b) => a - b);
        const found: ChatGap[] = [];
        for (let index = 1; index < numbers.length; index += 1) {
            const olderNo = numbers[index - 1];
            const newerNo = numbers[index];
            if (newerNo - olderNo - 1 < GAP_DIVIDER_MIN_MISSING) continue;
            const missing = uncoveredIn(covered, olderNo + 1, newerNo - 1).reduce(
                (sum, [low, high]) => sum + high - low + 1,
                0
            );
            if (missing >= GAP_DIVIDER_MIN_MISSING) found.push({ olderNo, newerNo, missing });
        }
        return found;
    }, [chats, covered]);

    const fetchRange = useCallback(
        async (cursorNo: number, { cursorIsRow = false }: { cursorIsRow?: boolean } = {}): Promise<boolean> => {
            if (!channelId || !isVerified || rangeInFlightRef.current.has(cursorNo)) return false;
            rangeInFlightRef.current.add(cursorNo);
            const generation = generationRef.current;
            let held = 0;
            for (const chat of chatsRef.current) {
                if (chat.chatNo && chat.chatNo < cursorNo && chat.chatNo >= cursorNo - LOAD_MORE_SIZE) held += 1;
            }
            try {
                const result = await chatRepository.refreshList(
                    { channelId, cursorNo, limit: LOAD_MORE_SIZE },
                    { markMissingHidden: true, cursorIsRow }
                );
                if (generation !== generationRef.current) return false;
                const added = result.fetchedCount - held;
                if (added > 0) growWindow(added);
                return true;
            } finally {
                rangeInFlightRef.current.delete(cursorNo);
            }
        },
        [chatRepository, channelId, isVerified, growWindow]
    );

    const fillGap = useCallback(
        async (gap: ChatGap, side: ChatGapSide) => {
            const key = chatGapKey(gap);
            const open = uncoveredIn(coveredRef.current, gap.olderNo + 1, gap.newerNo - 1);
            if (open.length === 0) return;
            const cursorNo =
                side === 'newer' ? open[open.length - 1][1] + 1 : Math.min(open[0][0] + LOAD_MORE_SIZE, gap.newerNo);
            setGapStatus(previous => new Map(previous).set(key, 'loading'));
            const settle = (status?: 'failed') =>
                setGapStatus(previous => {
                    const next = new Map(previous);
                    if (status) next.set(key, status);
                    else next.delete(key);
                    return next;
                });
            try {
                await fetchRange(cursorNo, { cursorIsRow: cursorNo === gap.newerNo });
                settle();
            } catch {
                settle('failed');
            }
        },
        [channelId, fetchRange]
    );

    const recheckedRef = useRef(new Set<number>());
    const recheckFailedAtRef = useRef(new Map<number, number>());
    useEffect(() => {
        recheckedRef.current = new Set();
        recheckFailedAtRef.current = new Map();
    }, [channelId]);

    const revalidateAround = useCallback(
        (chatNo: number) => {
            if (!channelId || !chatNo || chatNo <= 0) return;
            const writtenAt = chatsRef.current.find(chat => chat.chatNo === chatNo)?.__cacheMeta?.lastSyncedAt;
            if (writtenAt && writtenAt >= RUN_STARTED_AT) return;
            const low = Math.floor((chatNo - 1) / LOAD_MORE_SIZE) * LOAD_MORE_SIZE + 1;
            const high = low + LOAD_MORE_SIZE - 1;
            if (recheckedRef.current.has(low)) return;
            if (uncoveredIn(coveredRef.current, low, high).length === 0) return;
            const failedAt = recheckFailedAtRef.current.get(low);
            if (failedAt && Date.now() - failedAt < LOAD_MORE_RETRY_MAX_MS) return;
            fetchRange(high + 1).then(
                sent => {
                    if (sent) recheckedRef.current.add(low);
                },
                () => recheckFailedAtRef.current.set(low, Date.now())
            );
        },
        [channelId, fetchRange]
    );

    const fetchThrough = useCallback(
        (chatNo: number): Promise<boolean> => fetchRange(chatNo + LOAD_MORE_SIZE),
        [fetchRange]
    );

    const isFetched = useCallback(
        (chatNo: number): boolean => uncoveredIn(covered, chatNo, chatNo).length === 0,
        [covered]
    );

    return {
        messages,
        rawChats: chats,
        isLoading: isWindowLoading,
        isEmpty: !isWindowLoading && messages.length === 0,
        isLoadingMore,
        hasMore,
        canLoadMore: isVerified,
        isThreadStartLoaded: !hasMore || chats.length < pageLimit,
        loadMore,
        loadUntil,
        gaps,
        gapStatus,
        fillGap,
        revalidateAround,
        fetchThrough,
        isFetched,
    };
};
