import { useCallback, useState } from 'react';

import { logger } from '@chatic/app-messages';
import type { ChatView } from '@lemoncloud/chatic-socials-api';
import type { ChatReadPayload, ChatSendPayload } from '@lemoncloud/chatic-sockets-api';
import { useDynamicProfile } from '@chatic/web-core';
import { v4 as uuid } from 'uuid';

import { useRepositories } from '../data';

const APP_SYNC_EVENT_NAME = 'app-sync-updated';

type ChatMutationAction = 'send' | 'read' | 'delete';

interface AppSyncDetail<T = unknown> {
    domain?: string;
    action?: string;
    cid?: string;
    targetId?: string;
    targetSubId?: string;
    payload?: T;
    ref?: string;
}

const notifyAppUpdated = <T>(detail: AppSyncDetail<T>) => {
    window.dispatchEvent(new CustomEvent(APP_SYNC_EVENT_NAME, { detail }));
};

/**
 * 메시지 전송, 읽음 처리 등 채팅 상태를 변경하고 작업 진행 상태를 관리하는 훅
 */
export const useChatMutations = () => {
    const { chat: chatRepository, join: joinRepository } = useRepositories();
    const dynamicProfile = useDynamicProfile();
    const userId = dynamicProfile?.uid;

    const [pendingStates, setPendingStates] = useState<Record<ChatMutationAction, boolean>>({
        send: false,
        read: false,
        delete: false,
    });

    /**
     * 메시지 전송 (optimistic update 포함)
     */
    const sendMessage = useCallback(
        (payload: ChatSendPayload, tempId: string = uuid()): Promise<ChatView> => {
            if (!userId) return Promise.reject(new Error('User is not authenticated'));
            if (!payload.channelId) return Promise.reject(new Error('channelId is required'));
            if (!payload.content) return Promise.reject(new Error('content is required'));

            setPendingStates(prev => ({ ...prev, send: true }));

            // Optimistic update: 임시 메시지를 UI에 즉시 반영
            const tempMessage = {
                id: tempId,
                channelId: payload.channelId,
                content: payload.content,
                ownerId: userId,
                createdAt: Date.now(),
                isPending: true,
                isFailed: false,
            };

            notifyAppUpdated({
                domain: 'chat',
                action: 'send',
                targetId: payload.channelId,
                payload: tempMessage,
            });

            return chatRepository
                .sendChat(payload)
                .then((result: ChatView) => {
                    setPendingStates(prev => ({ ...prev, send: false }));

                    // temp 메시지를 서버 확정 메시지로 교체
                    notifyAppUpdated({
                        domain: 'chat',
                        action: 'send',
                        targetId: payload.channelId,
                        payload: result,
                        ref: tempId,
                    });

                    return result;
                })
                .catch((error: unknown) => {
                    setPendingStates(prev => ({ ...prev, send: false }));

                    // 타임아웃 또는 에러 시 실패 상태 전파
                    notifyAppUpdated({
                        domain: 'chat',
                        action: 'send',
                        targetId: payload.channelId,
                        payload: { ...tempMessage, isPending: false, isFailed: true },
                        ref: tempId,
                    });

                    throw error;
                });
        },
        [userId, chatRepository]
    );

    /**
     * 읽음 처리
     */
    const readMessage = useCallback(
        (payload: ChatReadPayload): Promise<void> => {
            if (!payload.channelId) return Promise.reject(new Error('channelId is required'));
            if (payload.chatNo === undefined) return Promise.reject(new Error('chatNo is required'));

            setPendingStates(prev => ({ ...prev, read: true }));

            return joinRepository
                .readChat(payload)
                .then(() => undefined)
                .finally(() => {
                    setPendingStates(prev => ({ ...prev, read: false }));
                });
        },
        [joinRepository]
    );

    /**
     * 메시지 삭제 (로컬 전용 - 전송 실패한 메시지 제거)
     */
    const deleteMessage = useCallback(async (messageId: string, channelId: string): Promise<void> => {
        if (!messageId) return Promise.reject(new Error('messageId is required'));

        setPendingStates(prev => ({ ...prev, delete: true }));

        try {
            notifyAppUpdated({
                domain: 'chat',
                action: 'delete',
                targetId: channelId,
                targetSubId: messageId,
            });
        } catch (error) {
            logger.error('CHAT', 'Failed to delete chat', { error, data: { messageId, channelId } });
            throw error;
        } finally {
            setPendingStates(prev => ({ ...prev, delete: false }));
        }
    }, []);

    return {
        isPending: pendingStates,
        sendMessage,
        readMessage,
        deleteMessage,
    };
};
