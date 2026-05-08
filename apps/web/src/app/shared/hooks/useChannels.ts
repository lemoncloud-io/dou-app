import { useCallback, useEffect, useRef, useState } from 'react';

import { logger } from '@chatic/app-messages';
import { useWebSocketV2Store } from '@chatic/socket';
import type { ClientChannelView, DomainChannel, DomainChannelListPayload, DomainChat, DomainJoin } from '@chatic/data';
import { useDynamicProfile } from '@chatic/web-core';

import { useRepositories } from '../data';

const DEFAULT_CHANNEL_LIMIT = 100;

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
    const requestSeqRef = useRef(0);
    const currentParamsRef = useRef(initialParams);

    const [channels, setChannels] = useState<ClientChannelView[]>([]);
    const channelsRef = useRef(channels);
    channelsRef.current = channels;
    const [isLoading, setIsLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isError, setIsError] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const fetchChannels = useCallback(
        async (params?: Partial<DomainChannelListPayload>, options?: { loading?: boolean }) => {
            const nextParams = { ...currentParamsRef.current, ...params };
            currentParamsRef.current = nextParams;

            if (!nextParams.sid) {
                setChannels([]);
                setIsLoading(false);
                setIsSyncing(false);
                setIsError(false);
                setErrorMessage(null);
                return;
            }

            const requestSeq = requestSeqRef.current + 1;
            requestSeqRef.current = requestSeq;

            if (options?.loading) setIsLoading(true);
            setIsSyncing(true);
            setIsError(false);
            setErrorMessage(null);

            try {
                const result = await channelRepository.fetchChannel(buildFetchPayload(nextParams), {
                    cachePolicy: 'network-only',
                });
                if (requestSeqRef.current !== requestSeq) return;

                const nextChannels = sortChannels(
                    (result.list ?? []).map((channel: DomainChannel) => toClientChannel(channel, userId))
                );
                setChannels(nextChannels);
            } catch (error) {
                if (requestSeqRef.current !== requestSeq) return;

                const message = error instanceof Error ? error.message : String(error);
                logger.error('CHANNEL', 'Failed to fetch channels from repository', {
                    error,
                    data: { placeId: nextParams.sid },
                });
                setIsError(true);
                setErrorMessage(message);
            } finally {
                if (requestSeqRef.current === requestSeq) {
                    setIsLoading(false);
                    setIsSyncing(false);
                }
            }
        },
        [channelRepository, userId]
    );

    // cloud 전환 시 채널 초기화 — place auth 완료 후 placeId 변경으로 재요청
    useEffect(() => {
        if (prevCloudIdRef.current !== cloudId) {
            prevCloudIdRef.current = cloudId;
            setChannels([]);
            setIsLoading(true);
            return;
        }
        currentParamsRef.current = initialParams;
        void fetchChannels(initialParams, { loading: true });
    }, [fetchChannels, targetPlaceId, cloudId, initialParams.detail, initialParams.limit, initialParams.page]);

    useEffect(() => {
        const unsubscribeUpdated = channelRepository.onChannelUpdated((channel: DomainChannel) => {
            setChannels(prev => {
                const nextChannel = toClientChannel(channel, userId);
                const exists = prev.some(item => item.id === nextChannel.id);
                if (!exists) return prev;

                const next = prev.map(item => (item.id === nextChannel.id ? { ...item, ...nextChannel } : item));
                return sortChannels(next);
            });
        });
        const unsubscribeDeleted = channelRepository.onChannelDeleted((channel: DomainChannel) => {
            setChannels(prev => prev.filter(item => item.id !== channel.id));
        });
        const unsubscribeChatCreated = chatRepository.onChatCreated((chat: DomainChat) => {
            const current = channelsRef.current;
            if (!chat.channelId || current.length === 0) return;
            if (current.some(channel => channel.id === chat.channelId)) {
                void fetchChannels();
            }
        });
        const unsubscribeJoinUpdated = joinRepository.onJoinUpdated((join: DomainJoin) => {
            const current = channelsRef.current;
            if (!join.channelId || current.length === 0) return;
            if (current.some(channel => channel.id === join.channelId)) {
                void fetchChannels();
            }
        });

        return () => {
            unsubscribeUpdated();
            unsubscribeDeleted();
            unsubscribeChatCreated();
            unsubscribeJoinUpdated();
        };
    }, [channelRepository, chatRepository, joinRepository, fetchChannels, userId]);

    return {
        channels,
        isLoading,
        isSyncing,
        isError,
        errorMessage,
        refresh: (options?: DomainChannelListPayload) => fetchChannels(options, { loading: false }),
        sync: (options?: DomainChannelListPayload) => fetchChannels(options, { loading: false }),
    };
};
