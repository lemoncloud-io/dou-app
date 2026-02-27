import { useCallback, useEffect, useState } from 'react';

interface Message {
    id: string;
    content: string;
    timestamp: Date;
    ownerId: string;
    ownerName?: string;
    readCount?: number;
    chatNo?: number;
}

interface StoredMessage extends Omit<Message, 'timestamp'> {
    timestamp: string;
    chatKey: string;
    compositeKey: string;
}

const DB_NAME = 'ChatDB';
const DB_VERSION = 2;
const STORE_NAME = 'messages';
const BROADCAST_CHANNEL_NAME = 'chat-messages-update';

const openDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);

        request.onupgradeneeded = event => {
            const db = request.result;

            if (event.oldVersion < 2) {
                if (db.objectStoreNames.contains(STORE_NAME)) {
                    db.deleteObjectStore(STORE_NAME);
                }
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'compositeKey' });
                store.createIndex('chatKey', 'chatKey', { unique: false });
            }
        };
    });
};

const getChatKey = (userId: string, channelId: string): string => {
    return `${userId}@${channelId}`;
};

const saveMessage = async (userId: string, channelId: string, message: Message): Promise<void> => {
    const db = await openDB();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    const chatKey = getChatKey(userId, channelId);
    const storedMessage: StoredMessage = {
        ...message,
        timestamp: message.timestamp.toISOString(),
        chatKey,
        compositeKey: `${chatKey}@${message.id}`,
    };

    store.put(storedMessage);

    // Broadcast update
    const channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
    channel.postMessage({ type: 'message-added', userId, channelId, message });
    channel.close();
};

const loadMessages = async (userId: string, channelId: string): Promise<Message[]> => {
    const db = await openDB();
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('chatKey');

    return new Promise((resolve, reject) => {
        const request = index.getAll(getChatKey(userId, channelId));

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const messages = request.result.map((stored: StoredMessage) => ({
                id: stored.id,
                content: stored.content,
                timestamp: new Date(stored.timestamp),
                ownerId: stored.ownerId,
                ownerName: stored.ownerName,
                chatNo: stored.chatNo,
            }));
            resolve(messages);
        };
    });
};

const clearMessages = async (userId: string, channelId: string): Promise<void> => {
    const db = await openDB();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('chatKey');

    const request = index.getAllKeys(getChatKey(userId, channelId));
    request.onsuccess = () => {
        const keys = request.result;
        keys.forEach(key => store.delete(key));
    };
};

export const useChatMessages = (userId: string | null, channelId: string | null) => {
    const [messages, setMessages] = useState<Message[]>([]);

    // 초기 로드
    useEffect(() => {
        if (!userId || !channelId) return;

        loadMessages(userId, channelId).then(setMessages).catch(console.error);
    }, [userId, channelId]);

    // BroadcastChannel 리스너
    useEffect(() => {
        if (!userId || !channelId) return;

        const channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);

        channel.onmessage = event => {
            const { type, userId: msgUserId, channelId: msgChannelId, message } = event.data;

            if (type === 'message-added' && msgUserId === userId && msgChannelId === channelId) {
                setMessages(prev => {
                    // 중복 방지
                    if (prev.some(m => m.id === message.id)) return prev;
                    return [...prev, message];
                });
            }
        };

        return () => channel.close();
    }, [userId, channelId]);

    // 메시지 추가
    const addMessage = useCallback(
        async (message: Message, targetChannelId?: string) => {
            const effectiveChannelId = targetChannelId || channelId;
            if (!effectiveChannelId) return;

            if (effectiveChannelId === channelId) {
                setMessages(prev => {
                    if (prev.some(m => m.id === message.id)) return prev;
                    return [...prev, message];
                });
            }

            if (userId && effectiveChannelId) {
                try {
                    await saveMessage(userId, effectiveChannelId, message);
                } catch (error) {
                    console.error('Failed to save message:', error);
                }
            }
        },
        [userId, channelId]
    );

    // 메시지 클리어
    const clearChatMessages = useCallback(async () => {
        setMessages([]);

        if (userId && channelId) {
            try {
                await clearMessages(userId, channelId);
            } catch (error) {
                console.error('Failed to clear messages:', error);
            }
        }
    }, [userId, channelId]);

    // 메시지 다시 로드
    const reloadMessages = useCallback(async () => {
        if (!userId || !channelId) return;

        try {
            const savedMessages = await loadMessages(userId, channelId);
            setMessages(savedMessages);
        } catch (error) {
            console.error('Failed to reload messages:', error);
        }
    }, [userId, channelId]);

    return {
        messages,
        addMessage,
        clearMessages: clearChatMessages,
        reloadMessages,
    };
};
