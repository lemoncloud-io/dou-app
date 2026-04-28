import type { AppMessage, AppMessageType } from '@chatic/app-messages';
import { postMessage, useAppMessageStore } from '@chatic/app-messages';

import { BROADCAST_CHANNEL_NAME } from './IndexedDBStorageAdapter';
import type { ChatStorageAdapter } from './ChatStorageAdapter';
import { toClientChatView } from '@chatic/chats';
import type { ChatView } from '@lemoncloud/chatic-socials-api';

const defaultCloudId = 'default';
const generateNonce = () => Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

const waitForAppMessage = <T extends AppMessageType>(
    type: T,
    predicate: (msg: Extract<AppMessage, { type: T }>) => boolean,
    send: () => void
): Promise<Extract<AppMessage, { type: T }>> =>
    new Promise(resolve => {
        const handler = (msg: Extract<AppMessage, { type: T }>) => {
            if (!predicate(msg)) return;
            useAppMessageStore.getState().removeHandler(type, handler);
            resolve(msg);
        };
        useAppMessageStore.getState().addHandler(type, handler);
        send();
    });

export const NativeDBStorageAdapter: ChatStorageAdapter = {
    /**
     * @deprecated Deprecated by Raine
     */
    save: async (userId, channelId, message) => {
        return;
    },

    load: async (_userId, channelId) => {
        const nonce = generateNonce();
        const response = await waitForAppMessage(
            'OnFetchAllCacheData',
            m => m.nonce === nonce,
            () =>
                postMessage({
                    type: 'FetchAllCacheData',
                    data: { type: 'chat', cid: defaultCloudId, query: { channelId, cid: defaultCloudId } },
                    nonce,
                })
        );
        return (response.data.items as ChatView[]).map(toClientChatView);
    },

    update: async (_userId, channelId, chatNo, readerUserId) => {
        const nonce = generateNonce();
        const response = await waitForAppMessage(
            'OnFetchAllCacheData',
            m => m.nonce === nonce,
            () =>
                postMessage({
                    type: 'FetchAllCacheData',
                    data: { type: 'chat', cid: defaultCloudId, query: { channelId, cid: defaultCloudId } },
                    nonce,
                })
        );
        const chats = response.data.items as ChatView[];
        /**
         * @deprecated Deprecated by Raine
         */
        await Promise.all(
            chats.filter(chat => (chat as any).chatNo <= chatNo && !(chat as any).readBy?.includes(readerUserId))
        );
    },

    /**
     * - 채팅 메시지 클리어
     * - TODO: 서버 스펙에 따라 바뀔 수 있음; (ex: 서버에서 메시지 삭제가 softDelete 형태일 경우 upsert 처리 해야함)
     * @deprecated
     */
    clear: async () => {
        return Promise.resolve();
    },

    /**
     * - 특정 채널에서 사용자가 읽지 않은 메시지 수 조회
     * @param userId join 정보를 찾기 위한 userId
     * @param channelId join 정보 찾기 및 메시지 정보를 조회하기 위해 사용
     */
    countUnread: async (userId, channelId) => {
        const nonce = generateNonce();
        const response = await waitForAppMessage(
            'OnFetchAllCacheData',
            m => m.nonce === nonce,
            () =>
                postMessage({
                    type: 'FetchAllCacheData',
                    data: { type: 'chat', cid: defaultCloudId, query: { channelId, cid: defaultCloudId } },
                    nonce,
                })
        );
        return (response.data.items as ChatView[]).filter(chat => !(chat as any).isRead && chat.ownerId !== userId)
            .length;
    },

    markAllRead: async (userId, channelId) => {
        const nonce = generateNonce();
        const response = await waitForAppMessage(
            'OnFetchAllCacheData',
            m => m.nonce === nonce,
            () =>
                postMessage({
                    type: 'FetchAllCacheData',
                    data: { type: 'chat', cid: defaultCloudId, query: { channelId, cid: defaultCloudId } },
                    nonce,
                })
        );
        const chats = response.data.items as ChatView[];
        await Promise.all(
            chats
                .filter(chat => !(chat as any).isRead)
                .map(chat => {
                    return;
                })
        );

        const bc = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
        bc.postMessage({ type: 'read-all', userId, channelId });
        bc.close();
    },
};
