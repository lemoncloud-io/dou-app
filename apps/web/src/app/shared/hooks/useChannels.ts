import { useCallback, useEffect, useRef, useState } from 'react';

import { logger } from '@chatic/app-messages';
import { useInterval } from '@chatic/shared';
import { useWebSocketV2Store } from '@chatic/socket';
import type { DomainChannel, DomainChannelListPayload, DomainChat, DomainJoin } from '@chatic/data';
import { cloudCore, useDynamicProfile } from '@chatic/web-core';

import { useRepositories } from '../data';
import type { ClientChannelView } from '../types';
import { debounce } from '../utils/debounce';

const DEFAULT_CHANNEL_LIMIT = 100;
const CHANNEL_POLL_INTERVAL_MS = 15_000;

export interface ChannelDebugInfo {
    subscribeCount: number;
    fetchCount: number;
    lastFetchAt: string | null;
    lastFetchResultCount: number | null;
    lastSubscribeAt: string | null;
    lastSubscribeResultCount: number | null;
    cacheKey: string;
    cacheHit: boolean;
    isVerified: boolean;
    isConnected: boolean;
    cloudId: string | null;
    targetPlaceId: string | undefined;
}

// 모듈 레벨 캐시 — unmount/remount 시에도 이전 채널 데이터를 즉시 표시하여 깜빡임 방지
const channelCache = new Map<string, ClientChannelView[]>();
const getChannelCacheKey = (cloudId: string | null, placeId?: string) => `${cloudId}:${placeId ?? ''}`;

const toClientChannel = (channel: DomainChannel, userId?: string): ClientChannelView => {
    const lastChatNo = channel.lastChat$?.chatNo ?? channel.chatNo ?? 0;
    const lastMessageIsMine = channel.lastChat$?.ownerId === userId;
    const myReadNo = lastMessageIsMine ? lastChatNo : (channel.$join?.chatNo ?? 0);
    const memberCount = channel.memberNo ?? channel.memberIds?.length ?? channel.$joins?.length ?? 0;

    return {
        ...channel,
        isOwner: channel.ownerId === userId,
        isSelfChat: channel.stereo === 'self',
        memberCount,
        unreadCount: channel.unreadCount ?? Math.max(0, lastChatNo - myReadNo),
    };
};

const sortChannels = (channels: ClientChannelView[]) =>
    [...channels].sort((a, b) => {
        const timeA = new Date(a.lastChat$?.createdAt ?? a.updatedAt ?? 0).getTime();
        const timeB = new Date(b.lastChat$?.createdAt ?? b.updatedAt ?? 0).getTime();
        return timeB - timeA;
    });

const buildFetchPayload = ({ sid: _placeId, ...params }: DomainChannelListPayload): DomainChannelListPayload => ({
    sid: _placeId,
    limit: params.limit ?? DEFAULT_CHANNEL_LIMIT,
    page: params.page,
    detail: params.detail,
});

export const useChannels = (initialParams: DomainChannelListPayload) => {
    const { channel: channelRepository, chat: chatRepository, join: joinRepository } = useRepositories();
    const profile = useDynamicProfile();
    const userId = profile?.uid;
    const targetPlaceId = initialParams.sid;
    const storeCloudId = useWebSocketV2Store(s => s.cloudId);
    const isConnected = useWebSocketV2Store(s => s.isConnected);
    const isVerified = useWebSocketV2Store(s => s.isVerified);
    // default cloud인 경우 WebSocket store에 cloudId가 설정되기 전에도 동작할 수 있도록 fallback
    const selectedCloudId = cloudCore.getSelectedCloudId();
    const cloudId = storeCloudId || selectedCloudId || null;

    const currentParamsRef = useRef(initialParams);
    const cacheKey = getChannelCacheKey(cloudId, targetPlaceId);

    // debug state
    const [debugInfo, setDebugInfo] = useState<
        Omit<ChannelDebugInfo, 'cacheKey' | 'cacheHit' | 'isVerified' | 'isConnected' | 'cloudId' | 'targetPlaceId'>
    >({
        subscribeCount: 0,
        fetchCount: 0,
        lastFetchAt: null,
        lastFetchResultCount: null,
        lastSubscribeAt: null,
        lastSubscribeResultCount: null,
    });
    const debugRef = useRef(debugInfo);
    debugRef.current = debugInfo;

    const [channels, setChannels] = useState<ClientChannelView[]>(() => channelCache.get(cacheKey) ?? []);
    const channelsRef = useRef(channels);
    channelsRef.current = channels;

    const [isLoading, setIsLoading] = useState(() => !channelCache.has(cacheKey));

    // 렌더 단계에서 cloud/place 전환 감지 — useEffect가 아닌 렌더 중에 상태를 초기화하여
    // 이전 place의 채널이 한 프레임 보이는 현상(flash) 방지
    const [prevCloudId, setPrevCloudId] = useState(cloudId);
    const [prevPlaceId, setPrevPlaceId] = useState(targetPlaceId);

    const isCloudSwitch = !!prevCloudId && prevCloudId !== cloudId;
    const isPlaceSwitch = !!prevPlaceId && prevPlaceId !== targetPlaceId;

    if (isCloudSwitch || isPlaceSwitch) {
        setChannels([]);
        setIsLoading(true);
    }
    if (prevCloudId !== cloudId) setPrevCloudId(cloudId);
    if (prevPlaceId !== targetPlaceId) setPrevPlaceId(targetPlaceId);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isError, setIsError] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    //  로컬 캐시 스트림 구독 (즉시 렌더링)
    // isVerified를 의존성에 포함 — 인증 완료 시 구독 재설정하여 최신 데이터 수신
    useEffect(() => {
        if (!targetPlaceId || !cloudId) {
            // 모듈 캐시 데이터가 있으면 초기화하지 않음 (remount 시 일시적 빈 값 방지)
            return;
        }

        const payload = buildFetchPayload({ ...currentParamsRef.current, sid: targetPlaceId });

        logger.info('CHANNEL', '[useChannels] subscribeList effect triggered', {
            data: { targetPlaceId, cloudId, isVerified, userId },
        });

        const unsubscribe = channelRepository.subscribeList(payload, result => {
            if (result === null) {
                logger.info('CHANNEL', '[useChannels] subscribeList callback: result is null');
                return;
            }
            const nextChannels = sortChannels(
                (result.list ?? []).map((channel: DomainChannel) => toClientChannel(channel, userId))
            );
            logger.info('CHANNEL', '[useChannels] subscribeList callback', {
                data: { count: nextChannels.length, ids: nextChannels.slice(0, 3).map(c => c.id) },
            });
            setDebugInfo(prev => ({
                ...prev,
                subscribeCount: prev.subscribeCount + 1,
                lastSubscribeAt: new Date().toISOString(),
                lastSubscribeResultCount: nextChannels.length,
            }));
            channelCache.set(getChannelCacheKey(cloudId, targetPlaceId), nextChannels);
            setChannels(nextChannels);
            // 데이터가 있을 때만 isLoading 해제 — 캐시 미스(빈 배열)로 조기 해제되면
            // fetchChannels 네트워크 응답 전에 "채널 없음" 빈 상태가 잠깐 보임.
            // 빈 place의 isLoading 해제는 fetchChannels에서 처리.
            if (nextChannels.length > 0) {
                setIsLoading(false);
            }
        });

        return () => unsubscribe();
    }, [targetPlaceId, cloudId, channelRepository, userId, isVerified]);

    const userIdRef = useRef(userId);
    userIdRef.current = userId;

    // 백그라운드 데이터 동기화
    const fetchChannels = useCallback(
        async (params?: Partial<DomainChannelListPayload> & { forceNetwork?: boolean }) => {
            const { forceNetwork, ...rest } = params ?? {};
            const nextParams = { ...currentParamsRef.current, ...rest };
            currentParamsRef.current = nextParams;

            if (!nextParams.sid) return;

            if (forceNetwork) setIsSyncing(true);
            setIsError(false);
            setErrorMessage(null);

            const cachePolicy = forceNetwork ? 'network-only' : 'cache-first';
            logger.info('CHANNEL', '[useChannels] fetchChannels start', {
                data: {
                    sid: nextParams.sid,
                    cachePolicy,
                    forceNetwork,
                    currentChannelCount: channelsRef.current.length,
                },
            });

            try {
                const result = await channelRepository.fetchChannel(buildFetchPayload(nextParams), {
                    cachePolicy,
                });
                const resultCount = (result.list ?? []).length;
                logger.info('CHANNEL', '[useChannels] fetchChannels result', {
                    data: {
                        resultCount,
                        currentChannelCount: channelsRef.current.length,
                        willSetDirectly: channelsRef.current.length === 0 && resultCount > 0,
                    },
                });
                setDebugInfo(prev => ({
                    ...prev,
                    fetchCount: prev.fetchCount + 1,
                    lastFetchAt: new Date().toISOString(),
                    lastFetchResultCount: resultCount,
                }));
                // fetchFromRemoteAndCache가 로컬 캐시에 직접 저장하지 않아
                // subscribeList 콜백이 도메인 이벤트 타이밍에 의존함.
                // 채널이 비어있으면 반환값으로 직접 보완하여 초기 로딩 지연 방지
                if (channelsRef.current.length === 0 && resultCount > 0) {
                    const nextChannels = sortChannels(
                        (result.list ?? []).map((channel: DomainChannel) => toClientChannel(channel, userIdRef.current))
                    );
                    logger.info('CHANNEL', '[useChannels] fetchChannels direct set', {
                        data: { count: nextChannels.length },
                    });
                    setChannels(nextChannels);
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                logger.error('CHANNEL', '[useChannels] fetchChannels failed', { error });
                setIsError(true);
                setErrorMessage(message);
            } finally {
                // 네트워크 fetch 완료 후 항상 isLoading 해제 — 빈 place도 "채널 없음"을 표시하려면
                // 네트워크 확인 후에만 로딩을 끝내야 함
                setIsLoading(false);
                if (forceNetwork) setIsSyncing(false);
            }
        },
        [channelRepository]
    );

    // 채널 데이터 동기화 — cloud/place 전환 시 초기화는 위 렌더 단계에서 처리,
    // 여기서는 fetchChannels만 호출.
    // isVerified를 의존성에 포함하여 WebSocket 인증 완료 시 re-fetch 트리거
    // (가드 없이 — 인증 전에도 cache-first로 로컬 데이터 표시 가능)
    useEffect(() => {
        logger.info('CHANNEL', '[useChannels] fetch effect triggered', {
            data: { targetPlaceId, cloudId, isConnected, isVerified },
        });
        currentParamsRef.current = initialParams;
        void fetchChannels(initialParams);
    }, [
        fetchChannels,
        targetPlaceId,
        cloudId,
        isConnected,
        isVerified,
        initialParams.detail,
        initialParams.limit,
        initialParams.page,
    ]);

    // 채팅/조인 업데이트 등 간접적 이벤트에 대한 동기화 트리거
    useEffect(() => {
        const debouncedFetchChannels = debounce(fetchChannels, 300);

        const unsubscribeChatCreated = chatRepository.onChatCreated((chat: DomainChat) => {
            if (!chat.channelId || channelsRef.current.length === 0) return;
            if (channelsRef.current.some(channel => channel.id === chat.channelId)) {
                void debouncedFetchChannels();
            }
        });
        const unsubscribeJoinUpdated = joinRepository.onJoinUpdated((join: DomainJoin) => {
            if (!join.channelId || channelsRef.current.length === 0) return;
            if (channelsRef.current.some(channel => channel.id === join.channelId)) {
                void debouncedFetchChannels();
            }
        });

        return () => {
            unsubscribeChatCreated();
            unsubscribeJoinUpdated();
        };
    }, [chatRepository, joinRepository, fetchChannels]);

    // 채널 목록 주기적 폴링 (WebSocket push 누락 시 unreadCount 등 보완)
    useInterval(
        () => {
            void fetchChannels();
        },
        targetPlaceId && cloudId ? CHANNEL_POLL_INTERVAL_MS : null
    );

    const fullDebugInfo: ChannelDebugInfo = {
        ...debugInfo,
        cacheKey,
        cacheHit: channelCache.has(cacheKey),
        isVerified,
        isConnected,
        cloudId,
        targetPlaceId,
    };

    return {
        channels,
        isLoading,
        isSyncing,
        isError,
        errorMessage,
        refresh: () => fetchChannels({ forceNetwork: true }),
        sync: (options?: DomainChannelListPayload) => fetchChannels(options),
        debugInfo: fullDebugInfo,
    };
};
