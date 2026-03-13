import type { ChannelView } from '@lemoncloud/chatic-socials-api';

import { openDB, CHANNELS_STORE_NAME, CHANNELS_BROADCAST_CHANNEL_NAME } from './IndexedDBStorageAdapter';
import type { ChannelStorageAdapter } from './ChannelStorageAdapter';

interface StoredChannel extends ChannelView {
    compositeKey: string;
    userKey: string;
}

const getCompositeKey = (userId: string, channelId: string) => `${userId}@${channelId}`;

export const IndexedDBChannelAdapter: ChannelStorageAdapter = {
    saveAll: async (userId, channels) => {
        const db = await openDB();
        const tx = db.transaction([CHANNELS_STORE_NAME], 'readwrite');
        const store = tx.objectStore(CHANNELS_STORE_NAME);

        // Clear existing channels for this user first
        const index = store.index('userKey');
        const existingKeysRequest = index.getAllKeys(userId);
        await new Promise<void>((resolve, reject) => {
            existingKeysRequest.onerror = () => reject(existingKeysRequest.error);
            existingKeysRequest.onsuccess = () => {
                existingKeysRequest.result.forEach(key => store.delete(key));
                resolve();
            };
        });

        // Save all new channels
        channels.forEach(channel => {
            if (!channel.id) return;
            const storedChannel: StoredChannel = {
                ...channel,
                compositeKey: getCompositeKey(userId, channel.id),
                userKey: userId,
            };
            store.put(storedChannel);
        });

        const bc = new BroadcastChannel(CHANNELS_BROADCAST_CHANNEL_NAME);
        bc.postMessage({ type: 'channels-updated', userId, channels });
        bc.close();
    },

    loadAll: async userId => {
        const db = await openDB();
        const index = db
            .transaction([CHANNELS_STORE_NAME], 'readonly')
            .objectStore(CHANNELS_STORE_NAME)
            .index('userKey');
        return new Promise((resolve, reject) => {
            const request = index.getAll(userId);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                const channels = request.result.map((stored: StoredChannel) => {
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars, unused-imports/no-unused-vars
                    const { compositeKey, userKey, ...channel } = stored;
                    return channel as ChannelView;
                });
                resolve(channels);
            };
        });
    },

    save: async (userId, channel) => {
        if (!channel.id) return;
        const db = await openDB();
        const store = db.transaction([CHANNELS_STORE_NAME], 'readwrite').objectStore(CHANNELS_STORE_NAME);
        const storedChannel: StoredChannel = {
            ...channel,
            compositeKey: getCompositeKey(userId, channel.id),
            userKey: userId,
        };
        store.put(storedChannel);

        const bc = new BroadcastChannel(CHANNELS_BROADCAST_CHANNEL_NAME);
        bc.postMessage({ type: 'channel-saved', userId, channel });
        bc.close();
    },

    remove: async (userId, channelId) => {
        const db = await openDB();
        const store = db.transaction([CHANNELS_STORE_NAME], 'readwrite').objectStore(CHANNELS_STORE_NAME);
        store.delete(getCompositeKey(userId, channelId));

        const bc = new BroadcastChannel(CHANNELS_BROADCAST_CHANNEL_NAME);
        bc.postMessage({ type: 'channel-removed', userId, channelId });
        bc.close();
    },

    clear: async userId => {
        const db = await openDB();
        const store = db.transaction([CHANNELS_STORE_NAME], 'readwrite').objectStore(CHANNELS_STORE_NAME);
        const index = store.index('userKey');
        const request = index.getAllKeys(userId);
        request.onsuccess = () => request.result.forEach(key => store.delete(key));
    },
};
