import { useCallback, useEffect } from 'react';

import { parsePointerWebSocketMessage, useWebSocketStore, useWebSocketWorker } from '@chatic/socket';
import { webCore } from '@chatic/web-core';

import { POINTER_CHANNEL } from '../types';

import type { WebSocketMessage } from '@chatic/socket';

const WS_ENDPOINT = import.meta.env.VITE_WS_ENDPOINT || '';

export interface UseInitPointerWebSocketReturn {
    connectionId: string | null;
    connect: () => Promise<void>;
    disconnect: () => void;
    send: (data: unknown) => void;
    pingCount: number;
    pongCount: number;
}

/**
 * Pointer-specific WebSocket initialization hook for Web
 * - Subscribes to POINTER_CHANNEL for receiving messages
 * - Uses Web Worker to prevent background tab throttling
 */
export const useInitPointerWebSocket = (sessionId?: string): UseInitPointerWebSocketReturn => {
    const setId = useWebSocketStore(state => state.setId);
    const setConnectionStatus = useWebSocketStore(state => state.setConnectionStatus);
    const broadcastMessage = useWebSocketStore(state => state.broadcastMessage);

    const tokenProvider = useCallback(async (): Promise<string | null> => {
        try {
            const tokenData = await webCore.getTokenSignature();
            return tokenData?.originToken?.identityToken ?? null;
        } catch (error) {
            console.error('[PointerSocket] Failed to get token:', error);
            return null;
        }
    }, []);

    const { id, connectionId, connectionStatus, lastMessage, disconnect, connect, send, pingCount, pongCount } =
        useWebSocketWorker<WebSocketMessage>({
            endpoint: WS_ENDPOINT,
            tokenProvider,
            messageParser: parsePointerWebSocketMessage,
            enabled: false,
            logPrefix: '[PointerSocket]',
            sessionId,
            channels: POINTER_CHANNEL,
        });

    // Sync state to store
    useEffect(() => {
        setId(id);
    }, [id, setId]);

    useEffect(() => {
        setConnectionStatus(connectionStatus);
    }, [connectionStatus, setConnectionStatus]);

    // Broadcast messages to subscribers
    useEffect(() => {
        if (lastMessage) {
            broadcastMessage(lastMessage);
        }
    }, [lastMessage, broadcastMessage]);

    return { connectionId, connect, disconnect, send, pingCount, pongCount };
};
