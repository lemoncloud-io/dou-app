/**
 * Generic WebSocket types for reusable socket connections
 * @packageDocumentation
 */

/**
 * WebSocket connection status
 */
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

/**
 * Base interface for WebSocket messages
 * All domain-specific messages should extend this
 */
export interface BaseWebSocketMessage {
    id?: string;
    action?: string;
    data?: unknown;
}

/**
 * Callback function types
 */
export type MessageCallback<T = BaseWebSocketMessage> = (message: T) => void;
export type StatusCallback = (status: ConnectionStatus) => void;
export type ConnectionIdCallback = (id: string, connectionId: string | null) => void;
export type ErrorCallback = (error: Error) => void;

/**
 * WebSocket service configuration
 */
export interface WebSocketServiceConfig {
    /** WebSocket endpoint URL (e.g., wss://api.example.com/ws) */
    endpoint: string;
    /** Authentication token */
    token: string;
    /** Query parameter name for authentication token (default: 'x-lemon-identity') */
    authQueryParam?: string;
    /** Ping interval in milliseconds (default: 180000 - 3 minutes) */
    pingInterval?: number;
    /** Log prefix for console messages (default: '[WebSocket]') */
    logPrefix?: string;
    /** Whether to automatically request connection ID on connect (default: true) */
    requestConnectionId?: boolean;
    /** Optional session ID to include in connection */
    sessionId?: string;
}
