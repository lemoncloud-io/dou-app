import { useCallback, useState } from 'react';
import { useWebSocketV2 } from '@chatic/socket';
import { useChannelRepository } from '../../repository';
import type { ChannelBody, ChannelView } from '@lemoncloud/chatic-socials-api';

type MutationAction = 'leave' | 'delete' | 'create' | 'update';

/**
 * 채널 관련 쓰기/수정 명령을 서버에 전달
 * DB 갱신 이벤트가 발생할 때까지 대기하여 Promise를 반환하는 통합 훅
 */
export const useChannelMutations = () => {
    const { emitAuthenticated } = useWebSocketV2();
    const repository = useChannelRepository();

    const [pendingStates, setPendingStates] = useState<Record<MutationAction, boolean>>({
        leave: false,
        delete: false,
        create: false,
        update: false,
    });

    const cleanup = useCallback((action: MutationAction, handler: (e: Event) => void, timeoutId: NodeJS.Timeout) => {
        setPendingStates(prev => ({ ...prev, [action]: false }));
        window.removeEventListener('local-db-updated', handler);
        clearTimeout(timeoutId);
    }, []);

    /**
     * 신규 채널 생성
     */
    const createChannel = useCallback(
        (payload: ChannelBody): Promise<ChannelView> => {
            const action: MutationAction = 'create';
            setPendingStates(prev => ({ ...prev, [action]: true }));

            return new Promise((resolve, reject) => {
                const onUpdate = async (e: Event) => {
                    const { detail } = e as CustomEvent;

                    //도메인, 방출된 액션, 채널 ID가 모두 일치할 때만 완료 처리
                    if (detail.domain === 'channel' && detail.action === 'start' && detail.channelId) {
                        cleanup(action, onUpdate, timeoutId);

                        const newChannel = await repository.getChannel(detail.channelId);
                        if (newChannel) {
                            const { sid, ...rest } = newChannel as any;
                            resolve(rest as ChannelView);
                        } else {
                            reject(new Error('A channel was created but could not be found in the local DB.'));
                        }
                    }
                };

                const timeoutId = setTimeout(() => {
                    cleanup(action, onUpdate, timeoutId);
                    reject(new Error('Channel creation timeout.'));
                }, 10000);

                window.addEventListener('local-db-updated', onUpdate);
                emitAuthenticated({ type: 'chat', action: 'start', payload });
            });
        },
        [emitAuthenticated, cleanup, repository]
    );

    /**
     * 채널 나가기
     */
    const leaveChannel = useCallback(
        (targetChannelId: string, userId?: string, reason?: string): Promise<void> => {
            const action: MutationAction = 'leave';
            setPendingStates(prev => ({ ...prev, [action]: true }));

            return new Promise((resolve, reject) => {
                const onUpdate = (e: Event) => {
                    const { detail } = e as CustomEvent;

                    if (
                        detail.domain === 'channel' &&
                        detail.action === 'leave' &&
                        detail.channelId === targetChannelId
                    ) {
                        cleanup(action, onUpdate, timeoutId);
                        resolve();
                    }
                };

                const timeoutId = setTimeout(() => {
                    cleanup(action, onUpdate, timeoutId);
                    reject(new Error('Time out to leave the channel.'));
                }, 5000);

                window.addEventListener('local-db-updated', onUpdate);
                emitAuthenticated({
                    type: 'chat',
                    action: 'leave',
                    payload: { channelId: targetChannelId, ...(userId && { userId }), ...(reason && { reason }) },
                });
            });
        },
        [emitAuthenticated, cleanup]
    );

    /**
     * 채널 삭제
     */
    const deleteChannel = useCallback(
        (targetChannelId: string): Promise<void> => {
            const action: MutationAction = 'delete';
            setPendingStates(prev => ({ ...prev, [action]: true }));

            return new Promise((resolve, reject) => {
                const onUpdate = (e: Event) => {
                    const { detail } = e as CustomEvent;
                    if (
                        detail.domain === 'channel' &&
                        detail.action === 'delete-channel' &&
                        detail.channelId === targetChannelId
                    ) {
                        cleanup(action, onUpdate, timeoutId);
                        resolve();
                    }
                };

                const timeoutId = setTimeout(() => {
                    cleanup(action, onUpdate, timeoutId);
                    reject(new Error('Channel deletion timeout'));
                }, 5000);

                window.addEventListener('local-db-updated', onUpdate);
                emitAuthenticated({ type: 'chat', action: 'delete-channel', payload: { channelId: targetChannelId } });
            });
        },
        [emitAuthenticated, cleanup]
    );

    /**
     * 채널 정보 업데이트
     */
    const updateChannel = useCallback(
        (payload: { channelId: string; name: string }): Promise<void> => {
            const action: MutationAction = 'update';
            setPendingStates(prev => ({ ...prev, [action]: true }));

            return new Promise((resolve, reject) => {
                const onUpdate = (e: Event) => {
                    const { detail } = e as CustomEvent;
                    if (
                        detail.domain === 'channel' &&
                        detail.action === 'update-channel' &&
                        detail.channelId === payload.channelId
                    ) {
                        cleanup(action, onUpdate, timeoutId);
                        resolve();
                    }
                };

                const timeoutId = setTimeout(() => {
                    cleanup(action, onUpdate, timeoutId);
                    reject(new Error('Channel update timeout'));
                }, 5000);

                window.addEventListener('local-db-updated', onUpdate);
                emitAuthenticated({ type: 'chat', action: 'update-channel', payload });
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
    };
};
