import { useCallback, useEffect, useState } from 'react';
import { useChatRepository, useJoinRepository } from '../../repository';
import type { ClientChatView } from '../../../types';

/**
 * 특정 채널의 메시지 목록을 조회하고 가공하여 상태로 관리하는 훅 (Read)
 */
export const useChats = (channelId?: string | null) => {
    const targetChannelId = channelId ?? 'default';
    const userRepository = useChatRepository();
    const joinRepository = useJoinRepository();
    const [messages, setMessages] = useState<ClientChatView[]>([]);

    /**
     * 데이터 패칭 및 ClientChatView로의 매핑/정렬/필터링
     */
    const fetchData = useCallback(async () => {
        const [rawMsgs, activeJoins] = await Promise.all([
            userRepository.getChatsByChannel(targetChannelId),
            joinRepository.getActiveJoinsByChannel(targetChannelId),
        ]);

        const totalActiveMembers = activeJoins.length;

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
    }, [targetChannelId, userRepository, joinRepository]);

    // 초기 데이터 로드
    useEffect(() => {
        void fetchData();
    }, [fetchData]);

    // 로컬 DB 갱신 이벤트 구독
    useEffect(() => {
        if (!userRepository.cloudId || !joinRepository.cloudId) return;
        const handleUpdate = (e: Event) => {
            const { detail } = e as CustomEvent;
            if (
                detail.domain === 'chat' &&
                detail.cid === userRepository.cloudId &&
                detail.channelId === targetChannelId
            ) {
                void fetchData();
            }
        };
        window.addEventListener('local-db-updated', handleUpdate);
        return () => window.removeEventListener('local-db-updated', handleUpdate);
    }, [targetChannelId, userRepository.cloudId, fetchData]);

    return {
        messages,
        refresh: fetchData,
    };
};
