import { useCallback, useRef } from 'react';

import { useWebSocketV2, useWebSocketV2Store } from '@chatic/socket';
import type { ChatView } from '@lemoncloud/chatic-socials-api';
import type { WSSEnvelope } from '@lemoncloud/chatic-sockets-api';

const SEND_TIMEOUT_MS = 30_000;

interface SendMessageOptions {
    tempId: string;
    onSuccess: (tempId: string, chatView: ChatView) => void;
    onError: (tempId: string) => void;
}

interface QueueItem {
    channelId: string;
    content: string;
    options: SendMessageOptions;
}

export const useSendMessage = () => {
    const { emitAuthenticated } = useWebSocketV2();
    const queueRef = useRef<QueueItem[]>([]);
    const processingRef = useRef(false);

    const processNext = useCallback(() => {
        if (processingRef.current || queueRef.current.length === 0) return;

        processingRef.current = true;
        const { channelId, content, options } = queueRef.current[0];
        const { tempId, onSuccess, onError } = options;

        let settled = false;

        const finish = () => {
            settled = true;
            unsub();
            clearTimeout(timer);
            queueRef.current.shift();
            processingRef.current = false;
            processNext();
        };

        const unsub = useWebSocketV2Store.subscribe(
            s => s.lastMessage,
            (envelope: WSSEnvelope<ChatView> | null) => {
                if (settled || envelope?.type !== 'chat') return;

                if (envelope.action === 'error') {
                    finish();
                    onError(tempId);
                    return;
                }

                if (envelope.action !== 'send') return;

                finish();
                onSuccess(tempId, envelope.payload as ChatView);
            }
        );

        const timer = setTimeout(() => {
            if (!settled) {
                finish();
                onError(tempId);
            }
        }, SEND_TIMEOUT_MS);

        emitAuthenticated({ type: 'chat', action: 'send', payload: { channelId, content } });
    }, [emitAuthenticated]);

    const sendMessage = useCallback(
        (channelId: string, content: string, options: SendMessageOptions) => {
            queueRef.current.push({ channelId, content, options });
            processNext();
        },
        [processNext]
    );

    return { sendMessage };
};
