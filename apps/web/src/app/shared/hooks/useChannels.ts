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
    // default cloud인 경우 WebSocket store에 cloudId가 설정되기 전에도 동작할 수 있도록 fallback
    const selectedCloudId = cloudCore.getSelectedCloudId();
    const cloudId = storeCloudId || (selectedCloudId === 'default' ? 'default' : null);

    const prevCloudIdRef = useRef(cloudId);
    const prevPlaceIdRef = useRef(targetPlaceId);
    const currentParamsRef = useRef(initialParams);
    const cacheKey = getChannelCacheKey(cloudId, targetPlaceId);

    const [channels, setChannels] = useState<ClientChannelView[]>(() => channelCache.get(cacheKey) ?? []);
    const channelsRef = useRef(channels);
    channelsRef.current = channels;

    const [isLoading, setIsLoading] = useState(() => !channelCache.has(cacheKey));
    const [isSyncing, setIsSyncing] = useState(false);
    const [isError, setIsError] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    //  로컬 캐시 스트림 구독 (즉시 렌더링)
    useEffect(() => {
        if (!targetPlaceId || !cloudId) {
            // 모듈 캐시 데이터가 있으면 초기화하지 않음 (remount 시 일시적 빈 값 방지)
            return;
        }

        const payload = buildFetchPayload({ ...currentParamsRef.current, sid: targetPlaceId });

        const unsubscribe = channelRepository.subscribeList(payload, result => {
            if (result === null) return;
            const nextChannels = sortChannels(
                (result.list ?? []).map((channel: DomainChannel) => toClientChannel(channel, userId))
            );
            channelCache.set(getChannelCacheKey(cloudId, targetPlaceId), nextChannels);
            setChannels(nextChannels);
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [targetPlaceId, cloudId, channelRepository, userId]);

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

            try {
                const cachePolicy = forceNetwork ? 'network-only' : 'cache-first';
                const result = await channelRepository.fetchChannel(buildFetchPayload(nextParams), {
                    cachePolicy,
                });
                // fetchFromRemoteAndCache가 로컬 캐시에 직접 저장하지 않아
                // subscribeList 콜백이 도메인 이벤트 타이밍에 의존함.
                // 채널이 비어있으면 반환값으로 직접 보완하여 초기 로딩 지연 방지
                if (channelsRef.current.length === 0 && (result.list ?? []).length > 0) {
                    const nextChannels = sortChannels(
                        (result.list ?? []).map((channel: DomainChannel) => toClientChannel(channel, userIdRef.current))
                    );
                    setChannels(nextChannels);
                    setIsLoading(false);
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                logger.error('CHANNEL', 'Failed to fetch channels from repository', { error });
                setIsError(true);
                setErrorMessage(message);
            } finally {
                if (forceNetwork) setIsSyncing(false);
            }
        },
        [channelRepository]
    );

    // 클라우드/플레이스 전환 시에만 채널 초기화 + 로더 표시
    // 단순 갱신(remount, polling, isConnected 변경)은 기존 데이터 유지하며 백그라운드 동기화만
    // 빈 값 → 실제 값은 "초기 세팅"이므로 전환으로 취급하지 않음
    useEffect(() => {
        const isCloudSwitch = !!prevCloudIdRef.current && prevCloudIdRef.current !== cloudId;
        const isPlaceSwitch = !!prevPlaceIdRef.current && prevPlaceIdRef.current !== targetPlaceId;

        prevCloudIdRef.current = cloudId;
        prevPlaceIdRef.current = targetPlaceId;

        if (isCloudSwitch || isPlaceSwitch) {
            setChannels([]);
            setIsLoading(true);
        } else {
            currentParamsRef.current = initialParams;
        }

        void fetchChannels(initialParams);
    }, [
        fetchChannels,
        targetPlaceId,
        cloudId,
        isConnected,
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

    return {
        channels,
        isLoading,
        isSyncing,
        isError,
        errorMessage,
        refresh: () => fetchChannels({ forceNetwork: true }),
        sync: (options?: DomainChannelListPayload) => fetchChannels(options),
    };
};
