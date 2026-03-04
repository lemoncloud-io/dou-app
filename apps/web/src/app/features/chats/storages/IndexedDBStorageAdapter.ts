import type { ChatStorageAdapter, Message } from './ChatStorageAdapter';

const DB_NAME = 'ChatDB';
const DB_VERSION = 2;
const STORE_NAME = 'messages';
export const BROADCAST_CHANNEL_NAME = 'chat-messages-update';

interface StoredMessage extends Omit<Message, 'timestamp'> {
    timestamp: string;
    chatKey: string;
    compositeKey: string;
}

const openDB = (): Promise<IDBDatabase> =>
    new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = event => {
            const db = request.result;
            if (event.oldVersion < 2) {
                if (db.objectStoreNames.contains(STORE_NAME)) db.deleteObjectStore(STORE_NAME);
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'compositeKey' });
                store.createIndex('chatKey', 'chatKey', { unique: false });
            }
        };
    });

const getChatKey = (userId: string, channelId: string) => `${userId}@${channelId}`;

export const IndexedDBStorageAdapter: ChatStorageAdapter = {
    save: async (userId, channelId, message) => {
        const db = await openDB();
        const store = db.transaction([STORE_NAME], 'readwrite').objectStore(STORE_NAME);
        const chatKey = getChatKey(userId, channelId);
        store.put({
            ...message,
            timestamp: message.timestamp.toISOString(),
            chatKey,
            compositeKey: `${chatKey}@${message.id}`,
        } satisfies StoredMessage);

        const bc = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
        bc.postMessage({ type: 'message-added', userId, channelId, message });
        bc.close();
    },

    load: async (userId, channelId) => {
        const db = await openDB();
        const index = db.transaction([STORE_NAME], 'readonly').objectStore(STORE_NAME).index('chatKey');
        return new Promise((resolve, reject) => {
            const request = index.getAll(getChatKey(userId, channelId));
            request.onerror = () => reject(request.error);
            request.onsuccess = () =>
                resolve(
                    request.result.map((s: StoredMessage) => ({
                        id: s.id,
                        content: s.content,
                        timestamp: new Date(s.timestamp),
                        ownerId: s.ownerId,
                        ownerName: s.ownerName,
                        chatNo: s.chatNo,
                        readBy: s.readBy,
                        isRead: s.isRead,
                        isSystem: s.isSystem,
                    }))
                );
        });
    },

    update: async (userId, channelId, chatNo, readerUserId) => {
        const db = await openDB();
        const store = db.transaction([STORE_NAME], 'readwrite').objectStore(STORE_NAME);
        const index = store.index('chatKey');
        const request = index.getAll(getChatKey(userId, channelId));
        request.onsuccess = () => {
            request.result
                .filter((m: StoredMessage) => (m.chatNo ?? 0) <= chatNo)
                .forEach((m: StoredMessage) => {
                    const readBy = m.readBy ?? [];
                    if (readBy.includes(readerUserId)) return;
                    const newReadBy = [...readBy, readerUserId];
                    store.put({ ...m, readBy: newReadBy, isRead: true });
                });
        };
    },

    clear: async (userId, channelId) => {
        const db = await openDB();
        const store = db.transaction([STORE_NAME], 'readwrite').objectStore(STORE_NAME);
        const request = store.index('chatKey').getAllKeys(getChatKey(userId, channelId));
        request.onsuccess = () => request.result.forEach(key => store.delete(key));
    },

    countUnread: async (userId, channelId) => {
        const db = await openDB();
        const index = db.transaction([STORE_NAME], 'readonly').objectStore(STORE_NAME).index('chatKey');
        return new Promise((resolve, reject) => {
            const request = index.getAll(getChatKey(userId, channelId));
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result.filter((m: StoredMessage) => m.isRead === false).length);
        });
    },

    markAllRead: async (userId, channelId) => {
        const db = await openDB();
        const store = db.transaction([STORE_NAME], 'readwrite').objectStore(STORE_NAME);
        const index = store.index('chatKey');
        return new Promise((resolve, reject) => {
            const request = index.getAll(getChatKey(userId, channelId));
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                request.result
                    .filter((m: StoredMessage) => m.isRead === false)
                    .forEach((m: StoredMessage) => store.put({ ...m, isRead: true }));

                const bc = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
                bc.postMessage({ type: 'read-all', userId, channelId });
                bc.close();
                resolve();
            };
        });
    },
};
