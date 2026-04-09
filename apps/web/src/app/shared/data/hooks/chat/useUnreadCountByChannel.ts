import { useState, useEffect, useCallback } from 'react';
import { useChatRepository, useJoinRepository } from '../../repository';
import { useDynamicProfile } from '@chatic/web-core';

/**
 * 특정 단일 채널의 안읽음 메시지 개수를 계산하는 훅입
 */
export const useUnreadCountByChannel = (channelId: string) => {
    const [unreadCount, setUnreadCount] = useState(0);
    const profile = useDynamicProfile();
    const userId = profile?.uid ?? null;

    const chatRepository = useChatRepository();
    const joinRepository = useJoinRepository();

    const calculateUnread = useCallback(async () => {
        if (!userId || !channelId) return;

        try {
            //  타겟 채널의 메시지만 로드
            const chats = await chatRepository.getChatsByChannel(channelId);

            // 읽음 커서 획득
            const allJoins = await joinRepository.getJoins();
            const myJoin = allJoins.find(j => j.channelId === channelId && j.userId === userId);
            const myReadNo = myJoin?.chatNo ?? 0;

            // 내 읽음 커서(chatNo)보다 큰 메시지를 필터링하여 카운팅
            const unread = chats.filter(c => (c.chatNo ?? 0) > myReadNo).length;
            setUnreadCount(unread);
        } catch (error) {
            console.error(`Failed to calculate unread for channel ${channelId}:`, error);
        }
    }, [userId, channelId, chatRepository, joinRepository]);

    useEffect(() => {
        void calculateUnread();
    }, [calculateUnread]);

    useEffect(() => {
        if (!chatRepository.cloudId) return;

        const handleUpdate = (e: Event) => {
            const { detail } = e as CustomEvent;
            // 타겟 채널의 채팅 수신 또는 읽음 처리 이벤트 발생 시에만 갱신
            if (
                detail.cid === chatRepository.cloudId &&
                detail.channelId === channelId &&
                (detail.domain === 'chat' || detail.domain === 'join')
            ) {
                void calculateUnread();
            }
        };

        window.addEventListener('local-db-updated', handleUpdate);
        return () => window.removeEventListener('local-db-updated', handleUpdate);
    }, [channelId, chatRepository.cloudId, calculateUnread]);

    return unreadCount;
};
