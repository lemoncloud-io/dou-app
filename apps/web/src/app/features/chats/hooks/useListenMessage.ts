import { useEffect } from 'react';

import { useWebSocketV2 } from '@chatic/socket';
import { useSimpleWebCore } from '@chatic/web-core';
import type { WSSEnvelope } from '@lemoncloud/chatic-sockets-api';
import type { ChatModel } from '@lemoncloud/chatic-socials-api/dist/modules/chats/model';

import { useChatMessages } from './useChatMessages';

export const useListenMessage = () => {
    const { lastMessage } = useWebSocketV2();
    const { profile } = useSimpleWebCore();
    const { addMessage } = useChatMessages(profile?.id ?? null, null);

    useEffect(() => {
        const chatMessage = lastMessage as WSSEnvelope<ChatModel>;
        if (chatMessage?.type === 'model' && chatMessage.action === 'create') {
            const channelId = chatMessage?.payload?.channelId;
            if (!channelId) return;

            const id = chatMessage.payload?.id || '0';
            const content = chatMessage.payload?.content || 'unknown';
            const timestamp = chatMessage.payload?.createdAt ? new Date(chatMessage.payload?.createdAt) : new Date();
            const ownerId = chatMessage.payload?.ownerId || '';
            const ownerName = chatMessage.payload?.owner$?.name || '알 수 없음';
            const readCount = chatMessage.payload?.readCount ?? 0;
            const chatNo = chatMessage.payload?.chatNo;

            addMessage(
                {
                    id,
                    content,
                    timestamp,
                    ownerId,
                    ownerName,
                    readCount,
                    chatNo,
                },
                channelId
            );
        }
    }, [lastMessage, addMessage]);
};
