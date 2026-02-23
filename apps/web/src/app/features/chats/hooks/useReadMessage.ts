import { useEffect } from 'react';

import { useReadPublicMessage } from '@chatic/chats';
import { useWebSocketV2 } from '@chatic/socket';
import type { WSSEnvelope } from '@lemoncloud/chatic-sockets-api';
import type { ChatModel } from '@lemoncloud/chatic-socials-api/dist/modules/chats/model';
import { useSimpleWebCore } from '@chatic/web-core';

export const useReadMessage = (channelId: string | undefined) => {
    const { mutateAsync: readMessage } = useReadPublicMessage();
    const { lastMessage } = useWebSocketV2();
    const { profile } = useSimpleWebCore();
    useEffect(() => {
        const chatMessage = lastMessage as WSSEnvelope<ChatModel>;
        const chatNo = chatMessage?.payload?.chatNo;

        if (
            chatMessage?.type === 'model' &&
            chatMessage.action === 'create' &&
            chatMessage.payload?.channelId === channelId &&
            chatMessage.payload?.ownerId !== profile?.uid
        ) {
            const sendReadMessage = async () => {
                if (!channelId || !chatNo) return;

                try {
                    await readMessage({ channelId, chatNo });
                } catch (error) {
                    console.error('Failed to read message:', error);
                }
            };

            sendReadMessage();
        }
    }, [lastMessage, channelId, readMessage, profile]);
};
