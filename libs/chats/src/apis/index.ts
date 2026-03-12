import { webCore } from '@chatic/web-core';

import type { ChatReadBody, ChatSendBody, ChatView, JoinView } from '@lemoncloud/chatic-socials-api';

const VITE_SOC_ENDPOINT = import.meta.env.VITE_SOC_ENDPOINT || '';

export const sendPublicMessage = async (body: ChatSendBody): Promise<ChatView> => {
    const { data } = await webCore
        .buildRequest({
            method: 'POST',
            baseURL: `${VITE_SOC_ENDPOINT}/hello/chat-send`,
        })
        .setBody(body)
        .execute<ChatView>();

    return data;
};

export const readPublicMessage = async (body: ChatReadBody): Promise<JoinView> => {
    const { data } = await webCore
        .buildRequest({
            method: 'POST',
            baseURL: `${VITE_SOC_ENDPOINT}/hello/chat-read`,
        })
        .setBody(body)
        .execute<JoinView>();
    return data;
};
