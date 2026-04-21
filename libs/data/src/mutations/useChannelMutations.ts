import { useCallback, useState } from 'react';
import { useWebSocketV2 } from '@chatic/socket';
import { useDynamicProfile } from '@chatic/web-core';
import type { ChannelView } from '@lemoncloud/chatic-socials-api';
import type {
    ChatDeleteChannelPayload,
    ChatInvitePayload,
    ChatLeavePayload,
    ChatStartPayload,
    ChatUpdateChannelPayload,
} from '@lemoncloud/chatic-sockets-api';
import type { AppSyncDetail } from '../sync-events';
import { APP_SYNC_EVENT_NAME } from '../sync-events';
import { useChannelRepository } from '../repository';

type MutationAction = 'leave' | 'delete' | 'start' | 'update' | 'invite';

/**
 * 채널 관련 쓰기/수정 명령을 서버에 전달
 * DB 갱신 이벤트가 발생할 때까지 대기하여 Promise를 반환하는 통합 훅
 */
export const useChannelMutations = () => {
    const { emitAuthenticated, cloudId } = useWebSocketV2();
    const dynamicProfile = useDynamicProfile();
    const repository = useChannelRepository(cloudId, dynamicProfile?.uid);

    const [pendingStates, setPendingStates] = useState<Record<MutationAction, boolean>>({
        leave: false,
        delete: false,
        start: false,
        update: false,
        invite: false,
    });

    const cleanup = useCallback((action: MutationAction, handler: (e: Event) => void, timeoutId: NodeJS.Timeout) => {
        setPendingStates(prev => ({ ...prev, [action]: false }));
        window.removeEventListener(APP_SYNC_EVENT_NAME, handler);
        clearTimeout(timeoutId);
    }, []);

    /**
     * 신규 채널 생성
     */
    const createChannel = useCallback(
        (payload: ChatStartPayload): Promise<ChannelView> => {
            if (!payload.stereo) return Promise.reject(new Error('stereo is required'));

            const action: MutationAction = 'start';
            setPendingStates(prev => ({ ...prev, [action]: true }));

            return new Promise((resolve, reject) => {
                const onUpdate = async (e: Event) => {
                    const { detail } = e as CustomEvent<AppSyncDetail>;

                    if (detail.domain === 'channel' && detail.action === 'start' && detail.targetId) {
                        cleanup(action, onUpdate, timeoutId);

                        const newChannel = await repository.getChannel(detail.targetId);
                        if (newChannel) {
                            const { sid, ...rest } = newChannel as any;
                            resolve(rest as ChannelView);
                        } else {
                            reject(new Error('Channel created but not found in local DB.'));
                        }
                    }
                };

                const timeoutId = setTimeout(() => {
                    cleanup(action, onUpdate, timeoutId);
                    reject(new Error('Channel creation timeout.'));
                }, 10000);

                window.addEventListener(APP_SYNC_EVENT_NAME, onUpdate);
                emitAuthenticated({ type: 'chat', action: 'start', payload });
            });
        },
        [emitAuthenticated, cleanup, repository]
    );

    /**
     * 채널 나가기
     */
    const leaveChannel = useCallback(
        (payload: ChatLeavePayload): Promise<void> => {
            if (!payload.channelId) return Promise.reject(new Error('channelId is required'));

            const action: MutationAction = 'leave';
            setPendingStates(prev => ({ ...prev, [action]: true }));

            return new Promise((resolve, reject) => {
                const onUpdate = (e: Event) => {
                    const { detail } = e as CustomEvent<AppSyncDetail>;

                    if (
                        detail.domain === 'channel' &&
                        detail.action === 'leave' &&
                        detail.targetId === payload.channelId
                    ) {
                        cleanup(action, onUpdate, timeoutId);
                        resolve();
                    }
                };

                const timeoutId = setTimeout(() => {
                    cleanup(action, onUpdate, timeoutId);
                    reject(new Error('Time out to leave the channel.'));
                }, 5000);

                window.addEventListener(APP_SYNC_EVENT_NAME, onUpdate);
                emitAuthenticated({ type: 'chat', action: 'leave', payload });
            });
        },
        [emitAuthenticated, cleanup]
    );

    /**
     * 채널 삭제
     */
    const deleteChannel = useCallback(
        (payload: ChatDeleteChannelPayload): Promise<void> => {
            if (!payload.channelId) return Promise.reject(new Error('channelId is required'));

            const action: MutationAction = 'delete';
            setPendingStates(prev => ({ ...prev, [action]: true }));

            return new Promise((resolve, reject) => {
                const onUpdate = (e: Event) => {
                    const { detail } = e as CustomEvent<AppSyncDetail>;

                    if (
                        detail.domain === 'channel' &&
                        detail.action === 'delete-channel' &&
                        detail.targetId === payload.channelId
                    ) {
                        cleanup(action, onUpdate, timeoutId);
                        resolve();
                    }
                };

                const timeoutId = setTimeout(() => {
                    cleanup(action, onUpdate, timeoutId);
                    reject(new Error('Channel deletion timeout'));
                }, 5000);

                window.addEventListener(APP_SYNC_EVENT_NAME, onUpdate);
                emitAuthenticated({ type: 'chat', action: 'delete-channel', payload });
            });
        },
        [emitAuthenticated, cleanup]
    );

    /**
     * 채널 정보 업데이트
     */
    const updateChannel = useCallback(
        (payload: ChatUpdateChannelPayload): Promise<void> => {
            if (!payload.channelId) return Promise.reject(new Error('channelId is required'));

            const action: MutationAction = 'update';
            setPendingStates(prev => ({ ...prev, [action]: true }));

            return new Promise((resolve, reject) => {
                const onUpdate = (e: Event) => {
                    const { detail } = e as CustomEvent<AppSyncDetail>;

                    if (
                        detail.domain === 'channel' &&
                        detail.action === 'update-channel' &&
                        detail.targetId === payload.channelId
                    ) {
                        cleanup(action, onUpdate, timeoutId);
                        resolve();
                    }
                };

                const timeoutId = setTimeout(() => {
                    cleanup(action, onUpdate, timeoutId);
                    reject(new Error('Channel update timeout'));
                }, 5000);

                window.addEventListener(APP_SYNC_EVENT_NAME, onUpdate);
                emitAuthenticated({ type: 'chat', action: 'update-channel', payload });
            });
        },
        [emitAuthenticated, cleanup]
    );

    /**
     * 채널에 기가입된 유저 초대
     */
    const inviteChannel = useCallback(
        (payload: ChatInvitePayload): Promise<void> => {
            if (!payload.channelId) return Promise.reject(new Error('channelId is required'));
            if (!payload.userIds?.length) return Promise.reject(new Error('userIds are required'));

            const action: MutationAction = 'invite';
            setPendingStates(prev => ({ ...prev, [action]: true }));

            return new Promise((resolve, reject) => {
                const onUpdate = (e: Event) => {
                    const { detail } = e as CustomEvent<AppSyncDetail>;

                    if (
                        detail.domain === 'channel' &&
                        detail.action === 'invite' &&
                        detail.targetId === payload.channelId
                    ) {
                        cleanup(action, onUpdate, timeoutId);
                        resolve();
                    }
                };

                const timeoutId = setTimeout(() => {
                    cleanup(action, onUpdate, timeoutId);
                    reject(new Error('Channel invite timeout'));
                }, 5000);

                window.addEventListener(APP_SYNC_EVENT_NAME, onUpdate);
                emitAuthenticated({ type: 'chat', action: 'invite', payload });
            });
        },
        [emitAuthenticated, cleanup]
    );

    return {
        isPending: pendingStates,
        createChannel,
        leaveChannel,
        deleteChannel,
        updateChannel,
        inviteChannel,
    };
};
