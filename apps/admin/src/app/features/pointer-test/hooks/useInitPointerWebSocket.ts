import { useCallback, useEffect } from 'react';

import { useWebSocketStore, useWebSocketWorker } from '@chatic/socket';
import { webCore } from '@chatic/web-core';

import type { WebSocketMessage } from '@chatic/socket';

const WS_ENDPOINT = import.meta.env.VITE_WS_ENDPOINT || '';
const POINTER_CHANNEL = '1000001'; // Channel for pointer sync

/**
 * Type guard to check if value is a non-null object
 */
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/**
 * Safely extract string value from object
 */
const getStringValue = (obj: Record<string, unknown>, key: string): string | undefined => {
    const value = obj[key];
    return typeof value === 'string' ? value : undefined;
};

/**
 * Parse raw WebSocket message data into generic WebSocketMessage
 * For pointer messages, uses 'type' as fallback ID since position messages don't have id/mid
 */
const parseWebSocketMessage = (data: unknown): WebSocketMessage | null => {
    if (!isObject(data)) {
        return null;
    }

    const payload =
        'action' in data && data['action'] === 'message' && 'data' in data && isObject(data['data'])
            ? data['data']
            : data;

    // Try to get messageId from id, mid, or fallback to type for routing
    const messageId =
        getStringValue(payload, 'id') ?? getStringValue(payload, 'mid') ?? getStringValue(payload, 'type') ?? 'unknown';

    return {
        id: messageId,
        data: payload,
    };
};

export interface UseInitPointerWebSocketReturn {
    connectionId: string | null;
    connect: () => Promise<void>;
    disconnect: () => void;
    send: (data: unknown) => void;
    pingCount: number;
    pongCount: number;
}

/**
 * Pointer-specific WebSocket initialization hook
 * - Uses Web Worker to prevent background tab throttling
 * - Syncs connection state to useWebSocketStore
 * - Broadcasts ALL messages (including those without id/mid)
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
            messageParser: parseWebSocketMessage,
            enabled: true,
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
            console.log('[PointerSocket] Broadcasting message:', lastMessage);
            broadcastMessage(lastMessage);
        }
    }, [lastMessage, broadcastMessage]);

    return { connectionId, connect, disconnect, send, pingCount, pongCount };
};
