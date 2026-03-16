import { postMessage, useAppMessageStore } from '@chatic/app-messages';

import { BROADCAST_CHANNEL_NAME } from './IndexedDBStorageAdapter';
import type { ChatStorageAdapter } from './ChatStorageAdapter';
import type { AppMessageType, AppMessage } from '@chatic/app-messages';
import { toChatView, toClientChatView } from '@chatic/chats';
import type { ChatView, JoinView } from '@lemoncloud/chatic-socials-api';

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
    save: async (userId, channelId, message) => {
        const chatView = { ...toChatView(message), channelId };
        const nonce = generateNonce();
        await waitForAppMessage(
            'OnSaveCacheData',
            m => m.nonce === nonce,
            () =>
                postMessage({
                    type: 'SaveCacheData',
                    data: { type: 'chat', id: message.id, item: chatView, cid: defaultCloudId },
                    nonce,
                })
        );

        const bc = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
        bc.postMessage({ type: 'message-added', userId, channelId, message });
        bc.close();
    },

    load: async (_userId, channelId) => {
        const nonce = generateNonce();
        const response = await waitForAppMessage(
            'OnFetchAllCacheData',
            m => m.nonce === nonce,
            () =>
                postMessage({
                    type: 'FetchAllCacheData',
                    data: { type: 'chat', query: { channelId, cid: defaultCloudId } },
                    nonce,
                })
        );
        return (response.data.items as ChatView[]).map(toClientChatView);
    },

    /**
     * TODO: `save`로 통일 필요
     * @deprecated
     */
    update: async () => {
        return Promise.resolve();
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
        // joinId 구성; joinId는 해당 형식으로 구성되어있음
        const joinId = `${channelId}@${userId}`;
        let nonce: string;

        nonce = generateNonce();
        const joinResponse = await waitForAppMessage(
            'OnFetchCacheData',
            m => m.nonce === nonce,
            () =>
                postMessage({ type: 'FetchCacheData', data: { type: 'join', id: joinId, cid: defaultCloudId }, nonce })
        );
        const lastReadChatNo = (joinResponse.data.item as JoinView)?.chatNo ?? 0;

        // channelId에 대한 모든 메시지 정보 불러오기
        nonce = generateNonce();
        const chatResponse = await waitForAppMessage(
            'OnFetchAllCacheData',
            m => m.nonce === nonce,
            () =>
                postMessage({
                    type: 'FetchAllCacheData',
                    data: { type: 'chat', query: { channelId, cid: defaultCloudId } },
                    nonce,
                })
        );

        // lastReadChatNo 보다 높은 번호들 측정해서 저장
        return (chatResponse.data.items as ChatView[]).filter(m => (m.chatNo ?? 0) > lastReadChatNo).length;
    },

    /**
     * TODO: isRead 여부는 Join 정보를 바탕으로 읽은 위치를 추적하도록 변경필요
     * @deprecated
     */
    markAllRead: async () => {
        return Promise.resolve();
    },
};
