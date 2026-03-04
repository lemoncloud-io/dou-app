import { useCallback, useEffect, useState } from 'react';

import type { Message } from '../storages/ChatStorageAdapter';
import { BROADCAST_CHANNEL_NAME } from '../storages/IndexedDBStorageAdapter';
import { useDynamicStorage } from './useDynamicStorage';

export type { Message };

export const useChatMessages = (userId: string | null, channelId: string | null) => {
    const storage = useDynamicStorage();
    const [messages, setMessages] = useState<Message[]>([]);

    useEffect(() => {
        if (!userId || !channelId) return;
        storage.load(userId, channelId).then(setMessages).catch(console.error);
    }, [userId, channelId, storage]);

    useEffect(() => {
        if (!userId || !channelId) return;

        const bc = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
        bc.onmessage = event => {
            const { type, userId: msgUserId, channelId: msgChannelId, message } = event.data;
            if (type === 'message-added' && msgUserId === userId && msgChannelId === channelId) {
                setMessages(prev => (prev.some(m => m.id === message.id) ? prev : [...prev, message]));
            }
        };
        return () => bc.close();
    }, [userId, channelId]);

    const addMessage = useCallback(
        async (message: Message, targetChannelId?: string) => {
            const effectiveChannelId = targetChannelId ?? channelId;
            if (!effectiveChannelId) return;

            if (effectiveChannelId === channelId) {
                setMessages(prev => (prev.some(m => m.id === message.id) ? prev : [...prev, message]));
            }

            if (userId) {
                await storage.save(userId, effectiveChannelId, message).catch(console.error);
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
        const saved = await storage.load(userId, channelId).catch(() => [] as Message[]);
        setMessages(saved);
    }, [userId, channelId, storage]);

    const markAllAsRead = useCallback(async () => {
        if (!userId || !channelId) return;
        if (!messages.some(m => m.isRead === false)) return;

        setMessages(prev => prev.map(m => ({ ...m, isRead: true })));
        await storage.markAllRead(userId, channelId).catch(console.error);
    }, [userId, channelId, messages, storage]);

    const applyReadEvent = useCallback(
        async (chatNo: number, newReadCount: number) => {
            if (!userId || !channelId) return;

            setMessages(prev =>
                prev.map(m =>
                    (m.chatNo ?? 0) <= chatNo
                        ? { ...m, readCount: Math.max(m.readCount ?? 0, newReadCount), isRead: true }
                        : m
                )
            );

            await storage.update(userId, channelId, chatNo, newReadCount).catch(console.error);
        },
        [userId, channelId, storage]
    );

    return { messages, addMessage, clearMessages, reloadMessages, markAllAsRead, applyReadEvent };
};

// storage 직접 접근이 필요한 외부 훅용 re-export
export const useStorageAdapter = () => useDynamicStorage();
