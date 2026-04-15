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
                setMessages(prev => {
                    if (prev.some(m => m.id === message.id)) return prev;
                    // real 메시지가 들어올 때 같은 content의 temp 메시지를 교체
                    if (!message.id.startsWith('temp-')) {
                        const tempIdx = prev.findIndex(m => m.id.startsWith('temp-') && m.content === message.content);
                        if (tempIdx !== -1) {
                            const next = [...prev];
                            next[tempIdx] = messageWithReadBy;
                            return next;
                        }
                    }
                    return [...prev, messageWithReadBy];
                });
            }

            // optimistic 메시지(temp-id)는 storage에 저장하지 않음
            if (userId && !message.id.startsWith('temp-')) {
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
            window.dispatchEvent(new CustomEvent('unread-refreshed', { detail: { channelId } }));
        },
        [userId, channelId, storage]
    );

    const updateMessage = useCallback((messageId: string, updater: (msg: ClientChatView) => ClientChatView) => {
        setMessages(prev => prev.map(m => (m.id === messageId ? updater(m) : m)));
    }, []);

    const removeMessage = useCallback((messageId: string) => {
        setMessages(prev => prev.filter(m => m.id !== messageId));
    }, []);

    return {
        messages,
        addMessage,
        updateMessage,
        removeMessage,
        clearMessages,
        reloadMessages,
        markAllAsRead,
        applyReadEvent,
    };
};

// storage 직접 접근이 필요한 외부 훅용 re-export
export const useStorageAdapter = () => useDynamicStorage();
