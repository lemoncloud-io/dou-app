import { useCallback, useState } from 'react';
import { useChatRepository } from '../../';
import { getSocketSend } from '@chatic/socket';
import type { ChatView } from '@lemoncloud/chatic-socials-api';
import { useDynamicProfile } from '@chatic/web-core';
import { notifyChatDbUpdated } from '../../sync/useChatCacheSync';

type ChatMutationAction = 'send' | 'read';

/**
 * 메시지 전송, 읽음 처리 등 채팅 상태를 변경하고 작업 진행 상태를 관리하는 훅
 */
export const useChatMutations = (channelId?: string | null) => {
    const targetChannelId = channelId ?? 'default';
    const repository = useChatRepository();
    const dynamicProfile = useDynamicProfile();
    const userId = dynamicProfile?.uid;

    const [pendingStates, setPendingStates] = useState<Record<ChatMutationAction, boolean>>({
        send: false,
        read: false,
    });

    const cleanup = useCallback(
        (action: ChatMutationAction, handler: (e: Event) => void, timeoutId: NodeJS.Timeout) => {
            setPendingStates(prev => ({ ...prev, [action]: false }));
            window.removeEventListener('local-db-updated', handler);
            clearTimeout(timeoutId);
        },
        []
    );

    /**
     * 메시지 전송
     */
    const sendMessage = useCallback(
        async (content: string, tempId: string = Date.now().toString()) => {
            if (!userId) return;

            const action: ChatMutationAction = 'send';
            setPendingStates(prev => ({ ...prev, [action]: true }));

            const onUpdate = (e: Event) => {
                const { detail } = e as CustomEvent;
                if (detail.domain === 'chat' && detail.channelId === targetChannelId) {
                    cleanup(action, onUpdate, timeoutId);
                }
            };

            const timeoutId = setTimeout(() => cleanup(action, onUpdate, timeoutId), 5000);

            const tempMessage: ChatView = {
                id: tempId,
                channelId: targetChannelId,
                content,
                ownerId: userId,
                createdAt: Date.now(),
            } as ChatView;

            // 로컬 DB 선저장
            await repository.saveChat(tempId, tempMessage);

            // 즉시 UI 갱신 이벤트 발생
            notifyChatDbUpdated({ domain: 'chat', cid: repository.cloudId, targetChannelId: targetChannelId });

            window.addEventListener('local-db-updated', onUpdate);

            const sendFn = getSocketSend();
            if (sendFn) {
                sendFn({
                    type: 'chat',
                    action: 'send',
                    payload: { channelId: targetChannelId, content },
                    meta: { ref: tempId },
                });
            }
        },
        [targetChannelId, userId, repository, cleanup]
    );

    /**
     * 읽음 처리
     */
    const readMessage = useCallback(
        async (chatNo: number) => {
            const action: ChatMutationAction = 'read';
            setPendingStates(prev => ({ ...prev, [action]: true }));

            const onUpdate = (e: Event) => {
                const { detail } = e as CustomEvent;
                if (detail.domain === 'chat' && detail.channelId === targetChannelId) {
                    cleanup(action, onUpdate, timeoutId);
                }
            };

            const timeoutId = setTimeout(() => cleanup(action, onUpdate, timeoutId), 10000);
            window.addEventListener('local-db-updated', onUpdate);

            const sendFn = getSocketSend();
            if (sendFn) {
                sendFn({
                    type: 'chat',
                    action: 'read',
                    payload: { channelId: targetChannelId, chatNo },
                });
            }
        },
        [targetChannelId, cleanup]
    );

    return {
        isPending: pendingStates,
        sendMessage,
        readMessage,
    };
};
