import { useMemo } from 'react';
import { createStorageAdapter } from '../local';
import { useWebSocketV2Store } from '@chatic/socket';
import type { ChatView } from '@lemoncloud/chatic-socials-api';

/**
 * 채팅 데이터의 CRUD 및 원본 데이터 조회를 담당하는 Repository 훅
 */
export const useChatRepository = () => {
    const cloudId = useWebSocketV2Store(s => s.cloudId) ?? 'default';

    const chatDB = useMemo(() => (cloudId ? createStorageAdapter<ChatView>('chat', cloudId) : null), [cloudId]);
    const joinDB = useMemo(() => (cloudId ? createStorageAdapter<any>('join', cloudId) : null), [cloudId]);

    // Query: 특정 채널의 채팅 내역 조회 (추후 DB 레벨 필터링으로 대체 가능)
    const getChatsByChannel = async (channelId: string): Promise<ChatView[]> => {
        if (!chatDB) return [];
        const msgs = await chatDB.loadAll();
        return msgs.filter(msg => msg.channelId === channelId);
    };

    // Query: 특정 채널의 활성 참여자 정보 조회
    const getActiveJoinsByChannel = async (channelId: string): Promise<any[]> => {
        if (!joinDB) return [];
        const joins = await joinDB.loadAll();
        return joins.filter(j => j.channelId === channelId && (j.joined === 1 || j.joined === undefined));
    };

    // Command: 채팅 메시지 단건 저장
    const saveChat = async (id: string, chat: ChatView): Promise<void> => {
        if (chatDB) await chatDB.save(id, chat);
    };

    // Command: 채팅 메시지 단건 삭제
    const deleteChat = async (id: string): Promise<void> => {
        if (chatDB) await chatDB.delete(id);
    };

    return {
        cloudId,
        getChatsByChannel,
        getActiveJoinsByChannel,
        saveChat,
        deleteChat,
    };
};
