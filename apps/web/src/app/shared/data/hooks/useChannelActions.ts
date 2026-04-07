import { useState, useEffect, useCallback } from 'react';
import { useWebSocketV2, useWebSocketV2Store } from '@chatic/socket';
import { useChannelRepository } from '../repository';
import type { ChannelView } from '@lemoncloud/chatic-socials-api';
import type { WSSEnvelope } from '@lemoncloud/chatic-sockets-api';
import type { CacheChannelView } from '@chatic/app-messages';
import { cloudCore } from '@chatic/web-core';

export const useChannelActions = () => {
    const { emitAuthenticated } = useWebSocketV2();
    const placeId = cloudCore.getSelectedPlaceId() ?? 'default';
    const repository = useChannelRepository();

    const [channels, setChannels] = useState<ChannelView[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isPending, setIsPending] = useState(false);
    const [isError, setIsError] = useState(false);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        setIsError(false);

        try {
            const channelsData: CacheChannelView[] = await repository.getChannelsByPlace(placeId);
            const sortedChannels = channelsData.sort((a, b) => {
                const timeA = new Date(a.lastChat$?.createdAt ?? a.updatedAt ?? 0).getTime();
                const timeB = new Date(b.lastChat$?.createdAt ?? b.updatedAt ?? 0).getTime();
                return timeB - timeA;
            });
            const uiChannels: ChannelView[] = sortedChannels.map(({ sid, ...rest }) => rest as ChannelView);
            setChannels(uiChannels);
        } catch (error) {
            console.error('Failed to fetch channels:', error);
            setIsError(true);
        } finally {
            setIsLoading(false);
        }
    }, [repository, placeId]);

    useEffect(() => {
        void fetchData();
    }, [fetchData]);

    useEffect(() => {
        if (!repository.cloudId) return;

        const handleUpdate = (e: Event) => {
            const { detail } = e as CustomEvent;
            if ((detail.domain === 'channel' || detail.domain === 'chat') && detail.cid === repository.cloudId) {
                void fetchData();
            }
        };

        window.addEventListener('local-db-updated', handleUpdate);
        return () => window.removeEventListener('local-db-updated', handleUpdate);
    }, [repository.cloudId, fetchData]);

    // 채널 나가기
    const leaveChannel = useCallback(
        async (targetChannelId: string, userId?: string, reason?: string): Promise<ChannelView> => {
            setIsPending(true);
            return new Promise((resolve, reject) => {
                const unsub = useWebSocketV2Store.subscribe(
                    s => s.lastMessage,
                    (envelope: WSSEnvelope<ChannelView> | null) => {
                        if (envelope?.type !== 'chat') return;
                        if (envelope.action === 'error') {
                            unsub();
                            setIsPending(false);
                            reject(new Error('chat/leave error'));
                        }
                        if (envelope.action === 'leave') {
                            unsub();
                            setIsPending(false);
                            resolve(envelope.payload as ChannelView);
                        }
                    }
                );
                emitAuthenticated({
                    type: 'chat',
                    action: 'leave',
                    payload: { channelId: targetChannelId, ...(userId && { userId }), ...(reason && { reason }) },
                });
            });
        },
        [emitAuthenticated]
    );

    // 채널 삭제
    const deleteChannel = useCallback(
        async (targetChannelId: string): Promise<ChannelView> => {
            setIsPending(true);
            return new Promise((resolve, reject) => {
                const unsub = useWebSocketV2Store.subscribe(
                    s => s.lastMessage,
                    (envelope: WSSEnvelope<ChannelView> | null) => {
                        if (envelope?.type !== 'chat') return;
                        if (envelope.action === 'error') {
                            unsub();
                            setIsPending(false);
                            reject(new Error('chat/delete-channel error'));
                        }
                        if (envelope.action === 'delete-channel') {
                            unsub();
                            setIsPending(false);
                            resolve(envelope.payload as ChannelView);
                        }
                    }
                );
                emitAuthenticated({ type: 'chat', action: 'delete-channel', payload: { channelId: targetChannelId } });
            });
        },
        [emitAuthenticated]
    );

    /**
     * 신규 채팅방 생성
     * @param stereo 채널 타입
     * @param content 초기 메시지 또는 채널 설명
     */
    const startChannel = useCallback(
        async (stereo: string, content: string): Promise<ChannelView> => {
            setIsPending(true);
            return new Promise((resolve, reject) => {
                const unsub = useWebSocketV2Store.subscribe(
                    s => s.lastMessage,
                    (envelope: WSSEnvelope<ChannelView> | null) => {
                        if (!envelope || envelope.type !== 'chat') return;

                        // 에러 발생 시 처리
                        if (envelope.action === 'error') {
                            unsub();
                            setIsPending(false);
                            reject(new Error('chat/start error'));
                            return;
                        }

                        if (envelope.action === 'start') {
                            unsub();
                            setIsPending(false);
                            resolve(envelope.payload as ChannelView);
                        }
                    }
                );

                emitAuthenticated({
                    type: 'chat',
                    action: 'start',
                    payload: {
                        stereo,
                        content,
                    },
                });
            });
        },
        [emitAuthenticated]
    );

    /**
     * 채팅방 초대 (invite) - 기 가입된 유저 초대
     * @param targetChannelId 초대할 대상 채널 ID
     * @param userIds 초대할 유저 ID 배열
     */
    const inviteChannel = useCallback(
        async (targetChannelId: string, userIds: string[]): Promise<ChannelView> => {
            setIsPending(true); //
            return new Promise((resolve, reject) => {
                const unsub = useWebSocketV2Store.subscribe(
                    s => s.lastMessage,
                    (envelope: WSSEnvelope<ChannelView> | null) => {
                        if (!envelope || envelope.type !== 'chat') return; //

                        if (envelope.action === 'error') {
                            unsub();
                            setIsPending(false);
                            reject(new Error('chat/invite error'));
                            return;
                        }

                        if (envelope.action === 'invite') {
                            unsub();
                            setIsPending(false); //
                            resolve(envelope.payload as ChannelView); //
                        }
                    }
                );

                emitAuthenticated({
                    type: 'chat',
                    action: 'invite',
                    payload: {
                        channelId: targetChannelId,
                        userIds,
                    },
                });
            });
        },
        [emitAuthenticated]
    );

    return {
        channels,
        isLoading,
        isError,
        isPending,
        leaveChannel,
        deleteChannel,
        startChannel,
        inviteChannel,
        refresh: fetchData,
    };
};
