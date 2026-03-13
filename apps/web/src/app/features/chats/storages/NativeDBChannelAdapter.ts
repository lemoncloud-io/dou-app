import { postMessage, useAppMessageStore } from '@chatic/app-messages';
import type { ChannelView } from '@lemoncloud/chatic-socials-api';

import { CHANNELS_BROADCAST_CHANNEL_NAME } from './IndexedDBStorageAdapter';
import type { ChannelStorageAdapter } from './ChannelStorageAdapter';
import type { AppMessageType, AppMessage } from '@chatic/app-messages';

/**
 * TODO:
 * 이후에는 반드시 실제 cid를 주입하여야함
 * @author raine@lemoncloud.io
 */
const defaultCloudId = 'default';
const generateNonce = () => Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

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
        if (channels.length === 0) return;

        const nonce = generateNonce();
        postMessage({
            type: 'SaveAllCacheData',
            nonce,
            data: {
                type: 'channel',
                items: channels,
                cid: defaultCloudId,
            },
        });

        await waitForAppMessage('OnSaveAllCacheData', m => m.nonce === nonce);

        const bc = new BroadcastChannel(CHANNELS_BROADCAST_CHANNEL_NAME);
        bc.postMessage({ type: 'channels-updated', userId, channels });
        bc.close();
    },

    loadAll: async () => {
        const nonce = generateNonce();
        postMessage({
            type: 'FetchAllCacheData',
            nonce,
            data: {
                type: 'channel',
                query: { cid: defaultCloudId },
            },
        });

        const response = await waitForAppMessage('OnFetchAllCacheData', m => m.nonce === nonce);
        return response.data.items as ChannelView[];
    },

    save: async (userId, channel) => {
        const nonce = generateNonce();
        postMessage({
            type: 'SaveCacheData',
            nonce,
            data: {
                type: 'channel',
                id: channel.id ?? '', //TODO: need to change!
                item: channel,
                cid: defaultCloudId,
            },
        });

        await waitForAppMessage('OnSaveCacheData', m => m.nonce === nonce);

        const bc = new BroadcastChannel(CHANNELS_BROADCAST_CHANNEL_NAME);
        bc.postMessage({ type: 'channel-saved', userId, channel });
        bc.close();
    },

    remove: async (userId, channelId) => {
        const nonce = generateNonce();
        postMessage({
            type: 'DeleteCacheData',
            nonce,
            data: {
                type: 'channel',
                id: channelId,
                cid: defaultCloudId,
            },
        });

        await waitForAppMessage('OnDeleteCacheData', m => m.nonce === nonce);

        const bc = new BroadcastChannel(CHANNELS_BROADCAST_CHANNEL_NAME);
        bc.postMessage({ type: 'channel-removed', userId, channelId });
        bc.close();
    },

    clear: async _userId => {
        // Native implementation would need a bulk delete - not implemented
    },
};
