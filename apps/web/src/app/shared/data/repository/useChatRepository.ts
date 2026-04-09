import { useMemo, useCallback } from 'react';
import { createStorageAdapter } from '../local';
import { useWebSocketV2Store } from '@chatic/socket';
import type { ChatView } from '@lemoncloud/chatic-socials-api';

/**
 * 채팅 메시지 및 참여 상태(ReadNo 등)의 영속성을 관리하는 리포지토리
 * 서버와의 연동 없이 로컬 DB(IndexedDB 등)와의 직접적인 입출력을 전담
 */
export const useChatRepository = () => {
    const cloudId = useWebSocketV2Store(s => s.cloudId) ?? 'default';
    const chatDB = useMemo(() => (cloudId ? createStorageAdapter<ChatView>('chat', cloudId) : null), [cloudId]);

    const getChats = useCallback(async (): Promise<ChatView[]> => {
        if (!chatDB) return [];
        return await chatDB.loadAll();
    }, [chatDB]);

    /**
     * 특정 채널의 메시지 목록을 로드
     * @param channelId 대상 채널 식별자
     */
    const getChatsByChannel = useCallback(
        async (channelId: string): Promise<ChatView[]> => {
            if (!chatDB) return [];
            const chats = await chatDB.loadAll();
            return chats.filter(chat => chat.channelId === channelId);
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

    return useMemo(
        () => ({
            cloudId,
            getChats,
            getChatsByChannel,
            saveChat,
            deleteChat,
        }),
        [cloudId, getChats, getChatsByChannel, saveChat, deleteChat]
    );
};
