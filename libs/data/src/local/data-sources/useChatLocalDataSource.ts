import { useCallback, useMemo } from 'react';
import { createStorageAdapter } from '../../data/local/storages';
import type { CacheChatView } from '@chatic/app-messages';

/**
 * 채팅 메시지 및 참여 상태(ReadNo 등)의 영속성을 관리하는 리포지토리
 * 서버와의 연동 없이 로컬 DB(IndexedDB 등)와의 직접적인 입출력을 전담
 * @param profileUid 유저별 캐시 파티셔닝용 — default(중계서버) 모드에서만 유저별 캐시 분리
 */
export const useChatLocalDataSource = (cloudId: string, profileUid?: string) => {
    const cid = cloudId === 'default' && profileUid ? `${cloudId}:${profileUid}` : cloudId;
    const chatDB = useMemo(() => (cloudId ? createStorageAdapter('chat', cid) : null), [cloudId, cid]);

    const getChats = useCallback(async (): Promise<CacheChatView[]> => {
        if (!chatDB) return [];
        return await chatDB.loadAll();
    }, [chatDB]);

    /**
     * 특정 채널의 메시지 목록을 로드
     * @param channelId 대상 채널 식별자
     */
    const getChatsByChannel = useCallback(
        async (channelId: string): Promise<CacheChatView[]> => {
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
        async (id: string, chat: CacheChatView): Promise<void> => {
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

    const clearAll = useCallback(async (): Promise<void> => {
        chatDB?.clearAll();
    }, [chatDB]);

    return useMemo(
        () => ({
            cloudId,
            getChats,
            getChatsByChannel,
            saveChat,
            deleteChat,
            clearAll,
        }),
        [cloudId, getChats, getChatsByChannel, saveChat, deleteChat, clearAll]
    );
};
