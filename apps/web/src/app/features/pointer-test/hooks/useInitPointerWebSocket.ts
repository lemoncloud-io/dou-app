import { useCallback, useEffect } from 'react';

import { useWebSocketStore, useWebSocketWorker } from '@chatic/socket';
import { webCore } from '@chatic/web-core';

import { POINTER_CHANNEL } from '../types';

import type { WebSocketMessage } from '@chatic/socket';

const WS_ENDPOINT = import.meta.env.VITE_WS_ENDPOINT || '';

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
 */
const parseWebSocketMessage = (data: unknown): WebSocketMessage | null => {
    if (!isObject(data)) {
        return null;
    }

    const payload =
        'action' in data && data['action'] === 'message' && 'data' in data && isObject(data['data'])
            ? data['data']
            : data;

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

    console.log('[useInitPointerWebSocket] POINTER_CHANNEL:', POINTER_CHANNEL);

    const { id, connectionId, connectionStatus, lastMessage, disconnect, connect, send, pingCount, pongCount } =
        useWebSocketWorker<WebSocketMessage>({
            endpoint: WS_ENDPOINT,
            tokenProvider,
            messageParser: parseWebSocketMessage,
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
