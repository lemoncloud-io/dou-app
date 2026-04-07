import { useMemo, useCallback } from 'react';
import { createStorageAdapter } from '../local';
import { useWebSocketV2Store } from '@chatic/socket';
import type { ChatView, JoinView } from '@lemoncloud/chatic-socials-api';

export const useChatRepository = () => {
    const cloudId = useWebSocketV2Store(s => s.cloudId) ?? 'default';

    const chatDB = useMemo(() => (cloudId ? createStorageAdapter<ChatView>('chat', cloudId) : null), [cloudId]);
    const joinDB = useMemo(() => (cloudId ? createStorageAdapter<JoinView>('join', cloudId) : null), [cloudId]);

    const getChatsByChannel = useCallback(
        async (channelId: string): Promise<ChatView[]> => {
            if (!chatDB) return [];
            const msgs = await chatDB.loadAll();
            return msgs.filter(msg => msg.channelId === channelId);
        },
        [chatDB]
    );

    const getActiveJoinsByChannel = useCallback(
        async (channelId: string): Promise<any[]> => {
            if (!joinDB) return [];
            const joins = await joinDB.loadAll();
            return joins.filter(j => j.channelId === channelId && (j.joined === 1 || j.joined === undefined));
        },
        [joinDB]
    );

    const saveChat = useCallback(
        async (id: string, chat: ChatView): Promise<void> => {
            if (chatDB) await chatDB.save(id, chat);
        },
        [chatDB]
    );

    const deleteChat = useCallback(
        async (id: string): Promise<void> => {
            if (chatDB) await chatDB.delete(id);
        },
        [chatDB]
    );

    const saveJoin = useCallback(
        async (id: string, join: JoinView): Promise<void> => {
            if (joinDB) await joinDB.save(id, join);
        },
        [joinDB]
    );

    return useMemo(
        () => ({
            cloudId,
            getChatsByChannel,
            getActiveJoinsByChannel,
            saveChat,
            deleteChat,
            saveJoin,
        }),
        [cloudId, getChatsByChannel, getActiveJoinsByChannel, saveChat, deleteChat, saveJoin]
    );
};
