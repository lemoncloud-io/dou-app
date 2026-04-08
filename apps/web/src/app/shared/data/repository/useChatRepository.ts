import { useMemo, useCallback } from 'react';
import { createStorageAdapter } from '../local';
import { useWebSocketV2Store } from '@chatic/socket';
import type { ChatView, JoinView } from '@lemoncloud/chatic-socials-api';

/**
 * 채팅 메시지 및 참여 상태(ReadNo 등)의 영속성을 관리하는 리포지토리
 * 서버와의 연동 없이 로컬 DB(IndexedDB 등)와의 직접적인 입출력을 전담
 */
export const useChatRepository = () => {
    const cloudId = useWebSocketV2Store(s => s.cloudId) ?? 'default';
    const chatDB = useMemo(() => (cloudId ? createStorageAdapter<ChatView>('chat', cloudId) : null), [cloudId]);
    const joinDB = useMemo(() => (cloudId ? createStorageAdapter<JoinView>('join', cloudId) : null), [cloudId]);

    /**
     * 특정 채널의 메시지 목록을 로드
     * @param channelId 대상 채널 식별자
     */
    const getChatsByChannel = useCallback(
        async (channelId: string): Promise<ChatView[]> => {
            if (!chatDB) return [];
            const msgs = await chatDB.loadAll();
            return msgs.filter(msg => msg.channelId === channelId);
        },
        [chatDB]
    );

    /**
     * 단일 메시지 저장
     */
    const saveChat = useCallback(
        async (id: string, chat: ChatView): Promise<void> => {
            if (chatDB) await chatDB.save(id, chat);
        },
        [chatDB]
    );

    /**
     * 메시지 삭제
     */
    const deleteChat = useCallback(
        async (id: string): Promise<void> => {
            if (chatDB) await chatDB.delete(id);
        },
        [chatDB]
    );

    /**
     * 채널의 안읽음 메시지 개수 계산
     * 채널 내 메시지 중 chatNo > 내가 마지막으로 읽은 chatNo)의 합계
     */
    const countUnread = useCallback(
        async (userId: string, channelId: string): Promise<number> => {
            if (!chatDB || !joinDB) return 0;

            // 참여 정보 로드 및 내 마지막 읽음 chatNo 획득
            const joins = await joinDB.loadAll();
            const myJoin = joins.find(j => j.channelId === channelId && j.userId === userId);
            const myReadNo = myJoin?.chatNo ?? 0;

            // 새로운 메시지 필터링
            const chats = await chatDB.loadAll();
            const unreadMessages = chats.filter(c => c.channelId === channelId && (c.chatNo ?? 0) > myReadNo);

            return unreadMessages.length;
        },
        [chatDB, joinDB]
    );

    /**
     * 앱 전체(여러 채널)의 안읽음 총합 계산
     * //TODO 개선필요
     */
    const countTotalUnread = useCallback(
        async (userId: string, channelIds: string[]): Promise<number> => {
            if (!chatDB || !joinDB || channelIds.length === 0) return 0;

            // 병렬 로드로 전체 데이터 확보
            const [allJoins, allChats] = await Promise.all([joinDB.loadAll(), chatDB.loadAll()]);

            let total = 0;
            for (const channelId of channelIds) {
                const myJoin = allJoins.find(j => j.channelId === channelId && j.userId === userId);
                const myReadNo = myJoin?.chatNo ?? 0;

                const unreadCount = allChats.filter(
                    c => c.channelId === channelId && (c.chatNo ?? 0) > myReadNo
                ).length;

                total += unreadCount;
            }

            return total;
        },
        [chatDB, joinDB]
    );

    return useMemo(
        () => ({
            cloudId,
            getChatsByChannel,
            saveChat,
            deleteChat,
            countUnread,
            countTotalUnread,
        }),
        [cloudId, getChatsByChannel, saveChat, deleteChat, countUnread, countTotalUnread]
    );
};
