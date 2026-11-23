import { useCallback } from 'react';

import { RELAY_CLOUD_ID, runtime } from '@chatic/runtime';
import type { ChatSendPayload, DomainChat } from '@chatic/runtime';

import { getChatOutbox, toSendPayload } from './useChatOutbox';

export const useChatMutations = () => {
    const sendMessage = useCallback((cid: string, payload: ChatSendPayload): Promise<DomainChat> => {
        if (!payload.channelId) return Promise.reject(new Error('channelId is required'));
        if (!payload.content) return Promise.reject(new Error('content is required'));

        return runtime.data.sendChatInCloud(cid, payload);
    }, []);

    const retryMessage = useCallback(async (message: DomainChat): Promise<DomainChat> => {
        const { content } = message;
        if (!message.channelId || !content) {
            throw new Error('cannot retry a message without channel/content');
        }
        const cid = message.cid || RELAY_CLOUD_ID;
        const staleId = message.id ?? message.tempId;
        if (staleId) {
            getChatOutbox()?.remove(staleId);
            await runtime.data.getCloudRepositories(cid).chat.cacheDelete(staleId);
        }
        return runtime.data.sendChatInCloud(cid, toSendPayload({ ...message, content }));
    }, []);

    const discardMessage = useCallback((message: DomainChat): Promise<void> => {
        const staleId = message.id ?? message.tempId;
        if (!staleId) return Promise.resolve();
        getChatOutbox()?.remove(staleId);
        return runtime.data.getCloudRepositories(message.cid || RELAY_CLOUD_ID).chat.cacheDelete(staleId);
    }, []);

    return { sendMessage, retryMessage, discardMessage };
};
