import { postMessage, useAppMessageStore } from '@chatic/app-messages';

import { BROADCAST_CHANNEL_NAME } from './IndexedDBStorageAdapter';
import type { ChatStorageAdapter, Message } from './ChatStorageAdapter';
import type { AppMessageType, AppMessage } from '@chatic/app-messages';

const waitForAppMessage = <T extends AppMessageType>(
    type: T,
    predicate: (msg: Extract<AppMessage, { type: T }>) => boolean
): Promise<Extract<AppMessage, { type: T }>> =>
    new Promise(resolve => {
        const handler = (msg: Extract<AppMessage, { type: T }>) => {
            if (!predicate(msg)) return;
            useAppMessageStore.getState().removeHandler(type, handler);
            resolve(msg);
        };
        useAppMessageStore.getState().addHandler(type, handler);
    });

export const NativeDBStorageAdapter: ChatStorageAdapter = {
    save: async (userId, channelId, message) => {
        const id = `${channelId}@${message.id}`;
        postMessage({ type: 'SaveCacheData', data: { type: 'chat', id, value: message } });
        await waitForAppMessage('OnSaveCacheData', m => m.data.type === 'chat' && m.data.id === id);

        const bc = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
        bc.postMessage({ type: 'message-added', userId, channelId, message });
        bc.close();
    },

    load: async (userId, channelId) => {
        postMessage({ type: 'FetchAllCacheData', data: { type: 'chat', channelId } });
        const response = await waitForAppMessage(
            'OnFetchAllCacheData',
            m => m.data.type === 'chat' && m.data.channelId === channelId
        );
        return (response.data.items as Message[]).map(m => ({ ...m, timestamp: new Date(m.timestamp) }));
    },

    update: async (_userId, channelId, chatNo, readerUserId) => {
        postMessage({ type: 'FetchAllCacheData', data: { type: 'chat', channelId } });
        const response = await waitForAppMessage(
            'OnFetchAllCacheData',
            m => m.data.type === 'chat' && m.data.channelId === channelId
        );
        const messages = response.data.items as Message[];
        await Promise.all(
            messages
                .filter(m => (m.chatNo ?? 0) <= chatNo)
                .map(m => {
                    const readBy = m.readBy ?? [];
                    if (readBy.includes(readerUserId)) return Promise.resolve();
                    const updated = { ...m, readBy: [...readBy, readerUserId], isRead: true };
                    const id = `${channelId}@${m.id}`;
                    postMessage({ type: 'SaveCacheData', data: { type: 'chat', id, value: updated } });
                    return waitForAppMessage('OnSaveCacheData', msg => msg.data.type === 'chat' && msg.data.id === id);
                })
        );
    },

    clear: async (_userId, channelId) => {
        void channelId;
    },

    countUnread: async (_userId, channelId) => {
        postMessage({ type: 'FetchAllCacheData', data: { type: 'chat', channelId } });
        const response = await waitForAppMessage(
            'OnFetchAllCacheData',
            m => m.data.type === 'chat' && m.data.channelId === channelId
        );
        return (response.data.items as Message[]).filter(m => m.isRead === false).length;
    },

    markAllRead: async (_userId, channelId) => {
        postMessage({ type: 'FetchAllCacheData', data: { type: 'chat', channelId } });
        const response = await waitForAppMessage(
            'OnFetchAllCacheData',
            m => m.data.type === 'chat' && m.data.channelId === channelId
        );
        const messages = response.data.items as Message[];
        await Promise.all(
            messages
                .filter(m => m.isRead === false)
                .map(m => {
                    const id = `${channelId}@${m.id}`;
                    postMessage({
                        type: 'SaveCacheData',
                        data: { type: 'chat', id, value: { ...m, isRead: true } },
                    });
                    return waitForAppMessage('OnSaveCacheData', msg => msg.data.type === 'chat' && msg.data.id === id);
                })
        );
    },
};
