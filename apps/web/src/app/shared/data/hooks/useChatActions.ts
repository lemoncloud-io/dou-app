import { useState, useEffect, useCallback } from 'react';
import { useChatRepository } from '../';
import { getSocketSend } from '@chatic/socket';
import type { ChatView } from '@lemoncloud/chatic-socials-api';
import type { ClientChatView } from '../../types';
import { notifyDbUpdated } from '../sync';

/**
 * 채팅 비즈니스 로직, 데이터 가공 및 UI 액션을 관리하는 훅
 */
export const useChatActions = (channelId: string | null, userId: string | null) => {
    const repository = useChatRepository();
    const [messages, setMessages] = useState<ClientChatView[]>([]);

    /**
     * 비즈니스 로직: 데이터 패칭 및 ClientChatView로의 매핑/정렬/필터링
     */
    const fetchAndProcessMessages = useCallback(async () => {
        if (!channelId) return;

        // Repository를 통해 원본 데이터 조회
        const [rawMsgs, activeJoins] = await Promise.all([
            repository.getChatsByChannel(channelId),
            repository.getActiveJoinsByChannel(channelId),
        ]);

        const totalActiveMembers = activeJoins.length;

        // Action 레벨의 비즈니스 로직 적용 (정렬 및 읽음 상태 계산)
        const processedData = rawMsgs
            .sort((a, b) => {
                const noA = a.chatNo ?? Number.MAX_SAFE_INTEGER;
                const noB = b.chatNo ?? Number.MAX_SAFE_INTEGER;
                if (noA === noB && a.createdAt && b.createdAt) {
                    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
                }
                return noA - noB;
            })
            .map((msg): ClientChatView => {
                let unreadCount = 0;
                const isPending = !msg.chatNo;
                const timestamp = msg?.createdAt ? new Date(msg.createdAt) : new Date();
                const isSystem = msg.stereo === 'system';
                const ownerName = msg.owner$?.name || '...';
                if (msg.chatNo !== undefined) {
                    const readCount = activeJoins.filter(join => (join.chatNo || 0) >= msg.chatNo!).length;
                    unreadCount = Math.max(0, totalActiveMembers - readCount);
                } else {
                    unreadCount = Math.max(0, totalActiveMembers - 1);
                }

                return { ...msg, unreadCount, isPending, timestamp, isSystem, ownerName };
            });

        setMessages(processedData);
    }, [channelId, repository]);

    // 초기 로드
    useEffect(() => {
        void fetchAndProcessMessages();
    }, [fetchAndProcessMessages]);

    // 로컬 DB 갱신 이벤트 구독 (웹소켓 수신 대응)
    useEffect(() => {
        if (!channelId || !repository.cloudId) return;
        const handleUpdate = (e: Event) => {
            const { detail } = e as CustomEvent;
            if (detail.domain === 'chat' && detail.cid === repository.cloudId && detail.channelId === channelId) {
                void fetchAndProcessMessages();
            }
        };
        window.addEventListener('local-db-updated', handleUpdate);
        return () => window.removeEventListener('local-db-updated', handleUpdate);
    }, [channelId, repository.cloudId, fetchAndProcessMessages]);

    /**
     * 액션: 메시지 전송 (Optimistic UI 로직 포함)
     */
    const sendMessage = useCallback(
        async (content: string, tempId: string = Date.now().toString()) => {
            if (!channelId || !userId) return;

            const tempMessage: ChatView = {
                id: tempId,
                channelId,
                content,
                ownerId: userId,
            } as ChatView;

            // Repository를 통한 로컬 우선 저장
            await repository.saveChat(tempId, tempMessage);

            notifyDbUpdated({ domain: 'chat', cid: repository.cloudId, channelId });

            // 실제 소켓 전송
            const sendFn = getSocketSend();
            if (sendFn) {
                sendFn({
                    type: 'chat',
                    action: 'send',
                    payload: { channelId, content },
                    meta: { ref: tempId },
                });
            }
        },
        [channelId, userId, repository]
    );

    /**
     * 액션: 읽음 처리
     */
    const readMessage = useCallback(
        async (chatNo: number) => {
            if (!channelId) return;
            const sendFn = getSocketSend();
            if (sendFn) {
                sendFn({ type: 'chat', action: 'read', payload: { channelId, chatNo } });
            }
        },
        [channelId]
    );

    return { messages, sendMessage, readMessage, refresh: fetchAndProcessMessages };
};
