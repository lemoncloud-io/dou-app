import { useCallback, useEffect, useRef } from 'react';

import { useWebSocketV2, useWebSocketV2Store } from '@chatic/socket';
import type { ChatView } from '@lemoncloud/chatic-socials-api';
import type { WSSEnvelope } from '@lemoncloud/chatic-sockets-api';

const SEND_TIMEOUT_MS = 30_000;

interface SendMessageOptions {
    tempId: string;
    onSuccess: (tempId: string, chatView: ChatView) => void;
    onError: (tempId: string) => void;
}

interface PendingItem {
    tempId: string;
    content: string;
    onSuccess: (tempId: string, chatView: ChatView) => void;
    onError: (tempId: string) => void;
    timer: ReturnType<typeof setTimeout>;
}

export const useSendMessage = () => {
    const { emitAuthenticated } = useWebSocketV2();
    const pendingRef = useRef<PendingItem[]>([]);

    useEffect(() => {
        const unsub = useWebSocketV2Store.subscribe(
            s => s.lastMessage,
            (envelope: WSSEnvelope<ChatView> | null) => {
                if (!envelope || envelope.type !== 'chat' || pendingRef.current.length === 0) return;

                if (envelope.action === 'send') {
                    const payload = envelope.payload as ChatView;
                    const idx = pendingRef.current.findIndex(p => p.content === payload.content);
                    if (idx === -1) return;
                    const item = pendingRef.current[idx];
                    pendingRef.current.splice(idx, 1);
                    clearTimeout(item.timer);
                    item.onSuccess(item.tempId, payload);
                    return;
                }

                if (envelope.action === 'error') {
                    const item = pendingRef.current.shift();
                    if (!item) return;
                    clearTimeout(item.timer);
                    item.onError(item.tempId);
                }
            }
        );
        return () => {
            unsub();
            pendingRef.current.forEach(item => clearTimeout(item.timer));
            pendingRef.current = [];
        };
    }, []);

    const sendMessage = useCallback(
        (channelId: string, content: string, options: SendMessageOptions) => {
            const { tempId, onSuccess, onError } = options;

            const timer = setTimeout(() => {
                const idx = pendingRef.current.findIndex(p => p.tempId === tempId);
                if (idx !== -1) {
                    pendingRef.current.splice(idx, 1);
                    onError(tempId);
                }
            }, SEND_TIMEOUT_MS);

            pendingRef.current.push({ tempId, content, onSuccess, onError, timer });
            emitAuthenticated({ type: 'chat', action: 'send', payload: { channelId, content } });
        },
        [emitAuthenticated]
    );

    return { sendMessage };
};
