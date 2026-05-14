import { useCallback, useEffect, useRef, useState } from 'react';

import { logger } from '@chatic/app-messages';
import { useInterval } from '@chatic/shared';
import { useWebSocketV2Store } from '@chatic/socket';
import type { DomainChannel, DomainChannelListPayload, DomainChat, DomainJoin } from '@chatic/data';
import { useDynamicProfile } from '@chatic/web-core';

import { useRepositories } from '../data';
import type { ClientChannelView } from '../types';
import { debounce } from '../utils/debounce';

const DEFAULT_CHANNEL_LIMIT = 100;
const CHANNEL_POLL_INTERVAL_MS = 15_000;

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
    const cloudId = useWebSocketV2Store(s => s.cloudId);

    const prevCloudIdRef = useRef(cloudId);
    const currentParamsRef = useRef(initialParams);

    const [channels, setChannels] = useState<ClientChannelView[]>([]);
    const channelsRef = useRef(channels);
    channelsRef.current = channels;

    const [isLoading, setIsLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isError, setIsError] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    //  로컬 캐시 스트림 구독 (즉시 렌더링)
    useEffect(() => {
        if (!targetPlaceId || !cloudId) {
            setChannels([]);
            setIsLoading(false);
            return;
        }

        const payload = buildFetchPayload({ ...currentParamsRef.current, sid: targetPlaceId });

        const unsubscribe = channelRepository.subscribeList(payload, result => {
            if (result === null) return;
            const nextChannels = sortChannels(
                (result.list ?? []).map((channel: DomainChannel) => toClientChannel(channel, userId))
            );
            setChannels(nextChannels);
            setIsLoading(false); // 캐시 렌더링 즉시 로딩 해제
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

            setIsSyncing(true);
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
                setIsSyncing(false);
            }
        },
        [channelRepository]
    );

    // 클라우드 전환 시 채널 초기화 및 백그라운드 동기화 요청
    useEffect(() => {
        if (prevCloudIdRef.current !== cloudId) {
            prevCloudIdRef.current = cloudId;
            setChannels([]);
            setIsLoading(true);
        } else {
            currentParamsRef.current = initialParams;
        }
        void fetchChannels(initialParams);
    }, [fetchChannels, targetPlaceId, cloudId, initialParams.detail, initialParams.limit, initialParams.page]);

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
