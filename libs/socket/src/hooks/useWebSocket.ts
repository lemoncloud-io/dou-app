import { useCallback, useEffect, useRef, useState } from 'react';

import { WebSocketService } from '../services';

import type { BaseWebSocketMessage, ConnectionStatus } from '../types';

/**
 * Configuration for useWebSocket hook
 */
export interface UseWebSocketConfig<TMessage extends BaseWebSocketMessage> {
    /** WebSocket endpoint URL (e.g., wss://api.example.com/ws) */
    endpoint: string;
    /** Async function to retrieve authentication token */
    tokenProvider: () => Promise<string | null>;
    /** Optional custom message parser function */
    messageParser?: (data: unknown) => TMessage | null;
    /** Whether to auto-connect on mount (default: true) */
    enabled?: boolean;
    /** Query parameter name for authentication (default: 'x-lemon-identity') */
    authQueryParam?: string;
    /** Ping interval in milliseconds (default: 180000 - 3 minutes) */
    pingInterval?: number;
    /** Log prefix for console messages (default: '[WebSocket]') */
    logPrefix?: string;
    /** Optional session ID to include in connection */
    sessionId?: string;
}

/**
 * Return type for useWebSocket hook
 */
export interface UseWebSocketReturn<TMessage extends BaseWebSocketMessage> {
    /** Current ID from server (from info action data.id) */
    id: string | null;
    /** Current connection ID from server */
    connectionId: string | null;
    /** Whether WebSocket is currently connected */
    isConnected: boolean;
    /** Current connection status */
    connectionStatus: ConnectionStatus;
    /** Last received message */
    lastMessage: TMessage | null;
    /** Manually trigger connection */
    connect: () => Promise<void>;
    /** Manually disconnect */
    disconnect: () => void;
}

/**
 * Generic WebSocket hook for React components
 * Manages WebSocket service lifecycle and provides state
 *
 * @typeParam TMessage - Message type that extends BaseWebSocketMessage
 * @param config - Hook configuration
 * @returns WebSocket connection state and controls
 *
 * @example
 * ```typescript
 * const { connectionId, isConnected, lastMessage } = useWebSocket<MyMessage>({
 *   endpoint: 'wss://api.example.com/ws',
 *   tokenProvider: async () => {
 *     const token = await getAuthToken();
 *     return token;
 *   },
 *   messageParser: (data) => {
 *     // Custom parsing logic
 *     return data as MyMessage;
 *   },
 *   enabled: true,
 *   logPrefix: '[MyWS]'
 * });
 * ```
 */
export const useWebSocket = <TMessage extends BaseWebSocketMessage = BaseWebSocketMessage>(
    config: UseWebSocketConfig<TMessage>
): UseWebSocketReturn<TMessage> => {
    const {
        endpoint,
        tokenProvider,
        messageParser,
        enabled = true,
        authQueryParam,
        pingInterval,
        logPrefix,
        sessionId,
    } = config;

    const wsService = useRef<WebSocketService<TMessage> | null>(null);

    const [id, setId] = useState<string | null>(null);
    const [connectionId, setConnectionId] = useState<string | null>(null);
    const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
    const [lastMessage, setLastMessage] = useState<TMessage | null>(null);
    const [isConnected, setIsConnected] = useState<boolean>(false);

    // Connect to WebSocket (async)
    const connect = useCallback(async (): Promise<void> => {
        if (!endpoint) {
            console.error(`${logPrefix || '[useWebSocket]'} Endpoint not configured`);
            return;
        }

        try {
            // Get authentication token
            const token = await tokenProvider();

            if (!token) {
                console.error(`${logPrefix || '[useWebSocket]'} No token available`);
                return;
            }

            // Create service instance if not exists
            if (!wsService.current) {
                wsService.current = new WebSocketService<TMessage>({
                    endpoint,
                    token,
                    authQueryParam,
                    pingInterval,
                    logPrefix,
                    sessionId,
                });

                // Set custom message parser if provided
                if (messageParser) {
                    wsService.current.setMessageParser(messageParser);
                }

                // Register callbacks
                wsService.current.onConnectionStatus(status => {
                    setConnectionStatus(status);
                    setIsConnected(status === 'connected');
                });

                wsService.current.onConnectionId((id, connId) => {
                    setId(id);
                    setConnectionId(connId);
                });

                wsService.current.onMessage(message => {
                    setLastMessage(message);
                });

                wsService.current.onError(error => {
                    console.error(`${logPrefix || '[useWebSocket]'} Error:`, error);
                });
            } else {
                // Update config if service already exists
                wsService.current.updateConfig({
                    endpoint,
                    token,
                    authQueryParam,
                    pingInterval,
                    logPrefix,
                    sessionId,
                });
            }

            // Connect
            console.log(`${logPrefix || '[useWebSocket]'} Connecting with token...`);
            wsService.current.connect();
        } catch (error) {
            console.error(`${logPrefix || '[useWebSocket]'} Failed to get token:`, error);
        }
    }, [endpoint, tokenProvider, messageParser, authQueryParam, pingInterval, logPrefix, sessionId]);

    // Disconnect from WebSocket
    const disconnect = useCallback((): void => {
        if (wsService.current) {
            wsService.current.disconnect();
            wsService.current = null;
        }
        setId(null);
        setConnectionId(null);
        setConnectionStatus('disconnected');
        setIsConnected(false);
    }, []);

    // Auto-connect when enabled
    useEffect(() => {
        if (!enabled) {
            return;
        }

        // Call async connect function
        void connect();

        // Cleanup on unmount
        return () => {
            if (wsService.current) {
                wsService.current.disconnect();
                wsService.current = null;
            }
            setId(null);
            setConnectionId(null);
            setConnectionStatus('disconnected');
            setIsConnected(false);
        };
    }, [enabled, connect]);

    // Add cleanup for page unload
    useEffect(() => {
        const handlePageHide = (): void => {
            // Graceful disconnect
            wsService.current?.disconnect();
        };

        window.addEventListener('pagehide', handlePageHide);

        return () => {
            window.removeEventListener('pagehide', handlePageHide);
        };
    }, []);

    return {
        id,
        connectionId,
        isConnected,
        connectionStatus,
        lastMessage,
        connect,
        disconnect,
    };
};
