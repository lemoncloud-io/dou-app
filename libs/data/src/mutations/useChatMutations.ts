import { useCallback, useState } from 'react';
import { useWebSocketV2 } from '@chatic/socket';
import type { ChatView } from '@lemoncloud/chatic-socials-api';
import { useDynamicProfile } from '@chatic/web-core';
import type { AppSyncDetail } from '../sync-events';
import { notifyAppUpdated } from '../sync-events';
import { APP_SYNC_EVENT_NAME } from '../sync-events';
import type { ChatReadPayload, ChatSendPayload } from '@lemoncloud/chatic-sockets-api';
import { useChatLocalDataSource } from '../local/data-sources';
import type { CacheChatView } from '@chatic/app-messages';
import { v4 as uuid } from 'uuid';

type ChatMutationAction = 'send' | 'read' | 'delete';

/**
 * 메시지 전송, 읽음 처리 등 채팅 상태를 변경하고 작업 진행 상태를 관리하는 훅
 */
export const useChatMutations = () => {
    const { emitAuthenticated, cloudId } = useWebSocketV2();
    const dynamicProfile = useDynamicProfile();
    const userId = dynamicProfile?.uid;
    const repository = useChatLocalDataSource(cloudId, userId);

    const [pendingStates, setPendingStates] = useState<Record<ChatMutationAction, boolean>>({
        send: false,
        read: false,
        delete: false,
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
        (payload: ChatSendPayload, tempId: string = uuid()): Promise<ChatView> => {
            if (!userId) return Promise.reject(new Error('User is not authenticated'));
            if (!payload.channelId) return Promise.reject(new Error('channelId is required'));
            if (!payload.content) return Promise.reject(new Error('content is required'));

            const action: ChatMutationAction = 'send';
            setPendingStates(prev => ({ ...prev, [action]: true }));

            return new Promise<ChatView>((resolve, reject) => {
                const onUpdate = (e: Event) => {
                    const { detail } = e as CustomEvent<AppSyncDetail>;

                    if (detail.domain === 'chat' && detail.action === 'send' && detail.targetId === payload.channelId) {
                        // 낙관적 업데이트 이벤트(isPending)는 무시, 서버 확정 응답만 처리
                        if (detail.payload?.isPending) return;
                        // ref가 있으면 내 temp 메시지와 정확히 매칭, 다른 메시지/유저의 이벤트 무시
                        if (detail.ref && detail.ref !== tempId) return;
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

                // DB 저장 완료 후 UI 즉시 갱신 → 소켓 발송
                repository.saveChat(tempId, tempMessage).then(() => {
                    // 서버 응답 리스너를 먼저 등록해야 notifyAppUpdated와 서버 응답 사이 race condition 방지
                    window.addEventListener(APP_SYNC_EVENT_NAME, onUpdate);

                    // 낙관적 업데이트: 임시 메시지를 UI에 즉시 반영
                    notifyAppUpdated({
                        domain: 'chat',
                        action: 'send',
                        cid: cloudId,
                        targetId: payload.channelId,
                        payload: tempMessage,
                    });

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
     * 메시지 삭제
     * 전송 실패한 메시지를 로컬에서 제거할때 사용
     */
    const deleteMessage = useCallback(
        async (messageId: string, channelId: string): Promise<void> => {
            if (!messageId) return Promise.reject(new Error('messageId is required'));

            const action: ChatMutationAction = 'delete';
            setPendingStates(prev => ({ ...prev, [action]: true }));

            try {
                // 1로컬 DB에서 메시지 삭제
                await repository.deleteChat(messageId);

                // UI 갱신을 위해 앱 전체에 동기화 알림 방출
                notifyAppUpdated({
                    domain: 'chat',
                    action: 'delete',
                    cid: cloudId,
                    targetId: channelId,
                });
            } catch (error) {
                console.error('Failed to delete chat:', error);
                throw error;
            } finally {
                setPendingStates(prev => ({ ...prev, [action]: false }));
            }
        },
        [repository, cloudId]
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
        deleteMessage,
    };
};
