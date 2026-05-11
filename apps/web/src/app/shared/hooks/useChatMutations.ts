import { useCallback, useState } from 'react';

import { logger } from '@chatic/app-messages';
import type { ChatReadPayload, ChatSendPayload } from '@lemoncloud/chatic-sockets-api';
import { useDynamicProfile } from '@chatic/web-core';

import { useRepositories } from '../data';
import type { DomainChat } from '@chatic/data';

type ChatMutationAction = 'send' | 'read' | 'delete';

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
        (payload: ChatSendPayload): Promise<DomainChat> => {
            if (!userId) return Promise.reject(new Error('User is not authenticated'));
            if (!payload.channelId) return Promise.reject(new Error('channelId is required'));
            if (!payload.content) return Promise.reject(new Error('content is required'));

            setPendingStates(prev => ({ ...prev, send: true }));

            return chatRepository
                .sendChat(payload)
                .then((result: DomainChat) => {
                    setPendingStates(prev => ({ ...prev, send: false }));
                    return result;
                })
                .catch((error: unknown) => {
                    setPendingStates(prev => ({ ...prev, send: false }));
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
    const deleteMessage = useCallback(
        async (messageId: string, channelId: string): Promise<void> => {
            if (!messageId) return Promise.reject(new Error('messageId is required'));

            setPendingStates(prev => ({ ...prev, delete: true }));

            try {
                await chatRepository.cacheDelete(messageId);
            } catch (error) {
                logger.error('CHAT', 'Failed to delete chat', { error, data: { messageId, channelId } });
                throw error;
            } finally {
                setPendingStates(prev => ({ ...prev, delete: false }));
            }
        },
        [chatRepository]
    );

    return {
        isPending: pendingStates,
        sendMessage,
        readMessage,
        deleteMessage,
    };
};
