import { useEffect, useState, useCallback } from 'react';
import { useDynamicProfile } from '@chatic/web-core';
import { useChatRepository, useJoinRepository } from '../../repository';
import type { ChannelView } from '@lemoncloud/chatic-socials-api';

/**
 * 앱 전체의 안읽음 메시지 총합을 계산하는 훅
 */
export const useTotalUnreadCount = (channels: ChannelView[]) => {
    const [totalCount, setTotalCount] = useState(0);
    const profile = useDynamicProfile();
    const userId = profile?.uid ?? null;

    const chatRepository = useChatRepository();
    const joinRepository = useJoinRepository();

    const calculateTotalUnread = useCallback(async () => {
        if (!userId || !channels || channels.length === 0) {
            setTotalCount(0);
            return;
        }

        try {
            const channelIds = channels.map(c => c.id).filter((id): id is string => Boolean(id));

            const [allJoins, allChats] = await Promise.all([joinRepository.getJoins(), chatRepository.getChats()]);

            const myJoinMap = new Map<string, number>();
            for (const j of allJoins) {
                if (j.userId === userId && j.channelId) {
                    myJoinMap.set(j.channelId, j.chatNo ?? 0);
                }
            }

            const channelIdSet = new Set(channelIds);
            let total = 0;

            // 안읽음 건수 일괄 합산
            for (const chat of allChats) {
                if (!chat.channelId || !channelIdSet.has(chat.channelId)) continue;

                const myReadNo = myJoinMap.get(chat.channelId) ?? 0;
                if ((chat.chatNo ?? 0) > myReadNo) {
                    total++;
                }
            }

            setTotalCount(total);
        } catch (error) {
            console.error('Failed to calculate total unread count:', error);
        }
    }, [userId, channels, chatRepository, joinRepository]);

    useEffect(() => {
        void calculateTotalUnread();
    }, [calculateTotalUnread]);

    useEffect(() => {
        if (!chatRepository.cloudId) return;

        const handleUpdate = (e: Event) => {
            const { detail } = e as CustomEvent;
            if (detail.cid === chatRepository.cloudId && (detail.domain === 'chat' || detail.domain === 'join')) {
                void calculateTotalUnread();
            }
        };

        window.addEventListener('local-db-updated', handleUpdate);
        return () => window.removeEventListener('local-db-updated', handleUpdate);
    }, [chatRepository.cloudId, calculateTotalUnread]);

    return totalCount;
};
