import { useCallback, useEffect, useState } from 'react';

import { BROADCAST_CHANNEL_NAME } from '../storages';
import { useDynamicStorage } from './useDynamicStorage';
import type { ClientChatView } from '@chatic/chats';

export const useChatMessages = (userId: string | null, channelId: string | null) => {
    const storage = useDynamicStorage();
    const [messages, setMessages] = useState<ClientChatView[]>([]);

    useEffect(() => {
        if (!userId || !channelId) return;
        storage.load(userId, channelId).then(setMessages).catch(console.error);
    }, [userId, channelId, storage]);

    useEffect(() => {
        if (!userId || !channelId) return;

        const bc = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
        bc.onmessage = event => {
            const { type, userId: msgUserId, channelId: msgChannelId, message } = event.data;
            if (type === 'message-added' && msgChannelId === channelId && (msgUserId === userId || message.isSystem)) {
                setMessages(prev =>
                    prev.some(m => m.id === message.id)
                        ? prev
                        : [...prev, { ...message, timestamp: new Date(message.timestamp) }]
                );
            }
        };
        return () => bc.close();
    }, [userId, channelId]);

    const addMessage = useCallback(
        async (message: ClientChatView, targetChannelId?: string) => {
            const effectiveChannelId = targetChannelId ?? channelId;
            if (!effectiveChannelId) return;

            const messageWithReadBy = { ...message, readBy: message.readBy ?? [message.ownerId] };

            if (effectiveChannelId === channelId) {
                setMessages(prev => (prev.some(m => m.id === message.id) ? prev : [...prev, messageWithReadBy]));
            }

            if (userId) {
                await storage.save(userId, effectiveChannelId, messageWithReadBy).catch(console.error);
            }
        },
        [userId, channelId, storage]
    );

    const clearMessages = useCallback(async () => {
        setMessages([]);
        if (userId && channelId) {
            await storage.clear(userId, channelId).catch(console.error);
        }
    }, [userId, channelId, storage]);

    const reloadMessages = useCallback(async () => {
        if (!userId || !channelId) return;
        const saved = await storage.load(userId, channelId).catch(() => [] as ClientChatView[]);
        setMessages(saved);
    }, [userId, channelId, storage]);

    const markAllAsRead = useCallback(async () => {
        if (!userId || !channelId) return;
        if (!messages.some(m => m.isRead === false)) return;

        setMessages(prev => prev.map(m => ({ ...m, isRead: true })));
        await storage.markAllRead(userId, channelId).catch(console.error);
    }, [userId, channelId, messages, storage]);

    const applyReadEvent = useCallback(
        async (chatNo: number, readerUserId: string) => {
            if (!userId || !channelId) return;

            setMessages(prev =>
                prev.map(m => {
                    if ((m.chatNo ?? 0) > chatNo) return m;
                    const readBy = m.readBy ?? [];
                    if (readBy.includes(readerUserId)) return m;
                    const newReadBy = [...readBy, readerUserId];
                    return { ...m, readBy: newReadBy, isRead: true };
                })
            );

            await storage.update(userId, channelId, chatNo, readerUserId).catch(console.error);
        },
        [userId, channelId, storage]
    );

    return { messages, addMessage, clearMessages, reloadMessages, markAllAsRead, applyReadEvent };
};

// storage 직접 접근이 필요한 외부 훅용 re-export
export const useStorageAdapter = () => useDynamicStorage();
