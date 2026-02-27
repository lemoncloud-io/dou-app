import { useState } from 'react';

import { useWebSocketV2, useWebSocketV2Store } from '@chatic/socket';
import type { ChatView } from '@lemoncloud/chatic-socials-api';
import type { WSSEnvelope } from '@lemoncloud/chatic-sockets-api';

export const useSendMessage = () => {
    const { emitAuthenticated } = useWebSocketV2();
    const [isPending, setIsPending] = useState(false);
    const [isError, setIsError] = useState(false);

    const sendMessage = (channelId: string, content: string): Promise<ChatView> => {
        setIsPending(true);
        setIsError(false);

        return new Promise((resolve, reject) => {
            const unsub = useWebSocketV2Store.subscribe(
                s => s.lastMessage,
                (envelope: WSSEnvelope<ChatView> | null) => {
                    if (envelope?.type !== 'chat') return;
                    if (envelope.action === 'error') {
                        unsub();
                        setIsError(true);
                        setIsPending(false);
                        reject(new Error('chat/invite error'));
                        return;
                    }
                    if (envelope.action !== 'send') return;
                    unsub();
                    setIsPending(false);
                    resolve(envelope.payload as ChatView);
                }
            );
            emitAuthenticated({ type: 'chat', action: 'send', payload: { channelId, content } });
        });
    };

    return { sendMessage, isPending, isError };
};
