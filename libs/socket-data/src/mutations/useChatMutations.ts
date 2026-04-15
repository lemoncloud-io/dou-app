import { useCallback, useState } from 'react';
import { useWebSocketV2 } from '@chatic/socket';
import type { ChatView } from '@lemoncloud/chatic-socials-api';
import { useDynamicProfile } from '@chatic/web-core';
import type { AppSyncDetail } from '../sync-events';
import { notifyAppUpdated } from '../sync-events';
import { APP_SYNC_EVENT_NAME } from '../sync-events';
import type { ChatReadPayload, ChatSendPayload } from '@lemoncloud/chatic-sockets-api';
import { useChatRepository } from '../repository';
import type { CacheChatView } from '@chatic/app-messages';

type ChatMutationAction = 'send' | 'read';

/**
 * 메시지 전송, 읽음 처리 등 채팅 상태를 변경하고 작업 진행 상태를 관리하는 훅
 */
export const useChatMutations = () => {
    const { emitAuthenticated, cloudId } = useWebSocketV2();
    const repository = useChatRepository(cloudId);
    const dynamicProfile = useDynamicProfile();
    const userId = dynamicProfile?.uid;

    const [pendingStates, setPendingStates] = useState<Record<ChatMutationAction, boolean>>({
        send: false,
        read: false,
    });

    const cleanup = useCallback(
        (action: ChatMutationAction, handler: (e: Event) => void, timeoutId: NodeJS.Timeout) => {
            setPendingStates(prev => ({ ...prev, [action]: false }));
            window.removeEventListener(APP_SYNC_EVENT_NAME, handler);
            clearTimeout(timeoutId);
        },
        []
    );

    /**
     * 메시지 전송
     */
    const sendMessage = useCallback(
        (payload: ChatSendPayload, tempId: string = Date.now().toString()): Promise<ChatView> => {
            if (!userId) return Promise.reject(new Error('User is not authenticated'));
            if (!payload.channelId) return Promise.reject(new Error('channelId is required'));
            if (!payload.content) return Promise.reject(new Error('content is required'));

            const action: ChatMutationAction = 'send';
            setPendingStates(prev => ({ ...prev, [action]: true }));

            return new Promise<ChatView>((resolve, reject) => {
                const onUpdate = (e: Event) => {
                    const { detail } = e as CustomEvent<AppSyncDetail>;

                    if (detail.domain === 'chat' && detail.action === 'send' && detail.targetId === payload.channelId) {
                        cleanup(action, onUpdate, timeoutId);
                        resolve(detail.payload);
                    }
                };

                // 로컬 DB 선저장
                const tempMessage: CacheChatView = {
                    id: tempId,
                    channelId: payload.channelId,
                    content: payload.content,
                    ownerId: userId,
                    createdAt: Date.now(),
                    isPending: true,
                    isFailed: false,
                };

                // 소켓 통신 타임 아웃시, chat 캐싱 업데이트
                const timeoutId = setTimeout(() => {
                    cleanup(action, onUpdate, timeoutId);
                    const failedMsg = {
                        ...tempMessage,
                        isPending: false,
                        isFailed: true,
                    };
                    repository
                        .saveChat(tempId, failedMsg)
                        .then(() => {
                            notifyAppUpdated({
                                domain: 'chat',
                                action: 'send',
                                cid: cloudId,
                                targetId: payload.channelId,
                                payload: failedMsg,
                            });
                        })
                        .catch(console.error);
                    reject(new Error('Message send timeout.'));
                }, 5000);

                // DB 저장 완료 후 소켓 발송
                repository.saveChat(tempId, tempMessage).then(() => {
                    window.addEventListener(APP_SYNC_EVENT_NAME, onUpdate);
                    emitAuthenticated({
                        type: 'chat',
                        action: 'send',
                        payload,
                        meta: { ref: tempId },
                    });
                });
            });
        },
        [userId, repository, emitAuthenticated, cleanup]
    );

    /**
     * 읽음 처리
     */
    const readMessage = useCallback(
        (payload: ChatReadPayload): Promise<void> => {
            if (!payload.channelId) return Promise.reject(new Error('channelId is required'));
            if (payload.chatNo === undefined) return Promise.reject(new Error('chatNo is required'));

            const action: ChatMutationAction = 'read';
            setPendingStates(prev => ({ ...prev, [action]: true }));

            return new Promise((resolve, reject) => {
                const onUpdate = (e: Event) => {
                    const { detail } = e as CustomEvent<AppSyncDetail>;

                    if (detail.domain === 'join' && detail.action === 'read' && detail.targetId === payload.channelId) {
                        cleanup(action, onUpdate, timeoutId);
                        resolve();
                    }
                };

                const timeoutId = setTimeout(() => {
                    cleanup(action, onUpdate, timeoutId);
                    reject(new Error('Message read timeout.'));
                }, 10000);

                window.addEventListener(APP_SYNC_EVENT_NAME, onUpdate);
                emitAuthenticated({
                    type: 'chat',
                    action: 'read',
                    payload,
                });
            });
        },
        [emitAuthenticated, cleanup]
    );

    return {
        isPending: pendingStates,
        sendMessage,
        readMessage,
    };
};
