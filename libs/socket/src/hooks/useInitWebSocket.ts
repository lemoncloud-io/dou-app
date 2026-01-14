import { useCallback, useEffect } from 'react';
import { AppState } from 'react-native';

import { useWebCoreStore, webCore } from '@chatic/web-core';

import { useWebSocket } from './useWebSocket';
import { useWebSocketStore } from '../stores/useWebSocketStore';

import type { WebSocketMessage } from '../stores/useWebSocketStore';

const WS_ENDPOINT = import.meta.env.VITE_WS_ENDPOINT || '';

/**
 * Parse raw WebSocket message data into generic WebSocketMessage
 * Only extracts the ID for routing - feature-specific parsing happens in subscribers
 */
const parseWebSocketMessage = (data: unknown): WebSocketMessage | null => {
    if (typeof data !== 'object' || data === null) {
        return null;
    }

    const msg = data as Record<string, unknown>;

    const payload =
        'action' in msg && msg['action'] === 'message' && 'data' in msg && msg['data']
            ? (msg['data'] as Record<string, unknown>)
            : msg;

    if ('id' in payload && payload['id']) {
        return {
            id: payload['id'] as string,
            data: payload,
        };
    }

    return null;
};

/**
 * App-level WebSocket initialization hook
 * - Single WebSocket connection for all features (dashboard, prods, items)
 * - Broadcasts all messages to subscribers via store
 * - Each feature subscribes and filters messages by ID pattern
 * - Should be called once at app root level (App.tsx)
 *
 * Message routing:
 * - Dashboard messages: ID starts with DSH*
 * - Prods messages: ID starts with PROD*
 * - Items messages: ID starts with ITEM*
 */
export const useInitWebSocket = (sessionId?: string) => {
    const { isAuthenticated } = useWebCoreStore();
    const setId = useWebSocketStore(state => state.setId);
    const setConnectionStatus = useWebSocketStore(state => state.setConnectionStatus);
    const broadcastMessage = useWebSocketStore(state => state.broadcastMessage);
    const reset = useWebSocketStore(state => state.reset);

    const tokenProvider = useCallback(async (): Promise<string | null> => {
        try {
            const tokenData = await webCore.getTokenSignature();
            return tokenData?.originToken?.identityToken || null;
        } catch (error) {
            console.error('[WebSocket] Failed to get token:', error);
            return null;
        }
    }, []);

    const { id, connectionStatus, lastMessage, disconnect, connect } = useWebSocket<WebSocketMessage>({
        endpoint: WS_ENDPOINT,
        tokenProvider,
        messageParser: parseWebSocketMessage,
        enabled: isAuthenticated,
        logPrefix: '[WebSocket]',
        sessionId,
    });

    // Sync WebSocket state to store
    useEffect(() => {
        setId(id);
    }, [id, setId]);

    useEffect(() => {
        console.log('[useInitWebSocket] connectionStatus changed:', connectionStatus);
        setConnectionStatus(connectionStatus);
    }, [connectionStatus, setConnectionStatus]);

    // Broadcast messages to all subscribers
    useEffect(() => {
        if (lastMessage) {
            broadcastMessage(lastMessage);
        }
    }, [lastMessage, broadcastMessage]);

    // Register logout callback to disconnect and reset
    useEffect(() => {
        if (!isAuthenticated) return;

        const cleanup = (): void => {
            disconnect();
            reset();
        };

        const unregister = useWebCoreStore.getState().registerLogoutCallback(cleanup);

        return unregister;
    }, [isAuthenticated, disconnect, reset]);

    // Handle AppState changes - disconnect when background, reconnect when foreground
    useEffect(() => {
        if (!isAuthenticated) return;

        const subscription = AppState.addEventListener('change', nextAppState => {
            if (nextAppState === 'active') {
                console.log('[useInitWebSocket] App became active - reconnecting');
                connect();
            } else if (nextAppState === 'background' || nextAppState === 'inactive') {
                console.log('[useInitWebSocket] App went to background/inactive - disconnecting');
                disconnect();
            }
        });

        return () => {
            subscription.remove();
        };
    }, [isAuthenticated, connect, disconnect]);

    // Return connect/disconnect for manual control
    return { connect, disconnect };
};
