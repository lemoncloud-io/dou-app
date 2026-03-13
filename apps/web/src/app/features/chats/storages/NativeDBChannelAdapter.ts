import { postMessage, useAppMessageStore } from '@chatic/app-messages';
import type { ChannelView } from '@lemoncloud/chatic-socials-api';

import { CHANNELS_BROADCAST_CHANNEL_NAME } from './IndexedDBStorageAdapter';
import type { ChannelStorageAdapter } from './ChannelStorageAdapter';
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

export const NativeDBChannelAdapter: ChannelStorageAdapter = {
    saveAll: async (userId, channels) => {
        await Promise.all(
            channels.map(channel => {
                const id = `${userId}@${channel.id}`;
                postMessage({ type: 'SaveCacheData', data: { type: 'channel', id, value: channel } });
                return waitForAppMessage('OnSaveCacheData', m => m.data.type === 'channel' && m.data.id === id);
            })
        );

        const bc = new BroadcastChannel(CHANNELS_BROADCAST_CHANNEL_NAME);
        bc.postMessage({ type: 'channels-updated', userId, channels });
        bc.close();
    },

    loadAll: async userId => {
        postMessage({ type: 'FetchAllCacheData', data: { type: 'channel', channelId: userId } });
        const response = await waitForAppMessage('OnFetchAllCacheData', m => m.data.type === 'channel');
        return response.data.items as ChannelView[];
    },

    save: async (userId, channel) => {
        const id = `${userId}@${channel.id}`;
        postMessage({ type: 'SaveCacheData', data: { type: 'channel', id, value: channel } });
        await waitForAppMessage('OnSaveCacheData', m => m.data.type === 'channel' && m.data.id === id);

        const bc = new BroadcastChannel(CHANNELS_BROADCAST_CHANNEL_NAME);
        bc.postMessage({ type: 'channel-saved', userId, channel });
        bc.close();
    },

    remove: async (userId, channelId) => {
        const id = `${userId}@${channelId}`;
        postMessage({ type: 'SaveCacheData', data: { type: 'channel', id, value: null } });
        await waitForAppMessage('OnSaveCacheData', m => m.data.type === 'channel' && m.data.id === id);

        const bc = new BroadcastChannel(CHANNELS_BROADCAST_CHANNEL_NAME);
        bc.postMessage({ type: 'channel-removed', userId, channelId });
        bc.close();
    },

    clear: async _userId => {
        // Native implementation would need a bulk delete - not implemented
    },
};
