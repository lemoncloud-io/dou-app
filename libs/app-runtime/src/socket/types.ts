import type {
    ClientSocketErrorEvent,
    ClientSocketMessageEvent,
    ClientSocketState,
    ClientSocketStateEvent,
    ClientSocketV2,
    SocketMessage,
} from '@lemoncloud/chatic-sockets-lib';

/**
 * Configuration options required to initialize and bind a socket connection.
 */
export interface SocketBindingConfig {
    /**
     * The destination WebSocket server URL.
     */
    url: string;
    /**
     * A unique identifier representing the user's device.
     */
    deviceId: string;
    /**
     * The type of the WebSocket connection, distinguishing between relaying or direct cloud connection.
     */
    wssType?: 'relay' | 'cloud';
}

/**
 * Comprehensive, observable state of the single managed socket.
 * Connection fields follow ClientSocketV2; `isVerified` is derived from the
 * app-level `auth.update` acknowledgement. Device registration is owned by the
 * sync runtime (createDeviceRuntime) and is no longer surfaced here.
 */
export interface SocketState {
    /** Raw transport state. */
    state: ClientSocketState;
    /** Shorthand for `state === 'connected'`. */
    isConnected: boolean;
    /** True once `auth.update:ok` has been acknowledged for this connection. */
    isVerified: boolean;
    /** Server-assigned connection id, when known. */
    connectionId: string | null;
}

export type SocketStateListener = (state: SocketState) => void;

export type SocketClientListener = (client: ClientSocketV2 | null) => void;

/**
 * Recovery policy hook injected by the session layer. SocketManager owns the
 * request mechanics (401 detect + retry) but delegates "how to recover" here so
 * auth/token policy stays in SocketSessionController (see architecture.md §1).
 * Returns true once the connection is re-authenticated and the request may retry.
 */
export type SocketRecoveryHandler = () => Promise<boolean>;

export interface ISocketManager {
    ensure(config: SocketBindingConfig): ClientSocketV2;
    getClient(): ClientSocketV2 | null;
    getSnapshot(): SocketState;
    subscribe(listener: SocketStateListener): () => void;
    subscribeClient(listener: SocketClientListener): () => void;
    waitUntilVerified(timeoutMs?: number): Promise<boolean>;
    markVerified(): void;
    markUnverified(): void;
    connect(): Promise<void>;
    destroy(): void;

    // Stable request facade (absorbed from the former ManagedSocketClientProxy).
    // Gateways bind to these instead of a raw ClientSocketV2 so socket replacement
    // stays invisible to them.
    setRecoveryHandler(handler: SocketRecoveryHandler | null): void;
    request<T = unknown>(type: string, data?: unknown, options?: { timeoutMs?: number }): Promise<T>;
    send<T = unknown>(type: string | SocketMessage<T>, data?: T): void;
    onType<T = unknown>(type: string, listener: (message: SocketMessage<T>) => void): () => void;
    onMessage(listener: (event: ClientSocketMessageEvent) => void): () => void;
    onState(listener: (event: ClientSocketStateEvent) => void): () => void;
    onError(listener: (event: ClientSocketErrorEvent) => void): () => void;
    disconnect(code?: number, reason?: string): Promise<void>;
}

export interface SocketSessionDelegate {
    getSocketToken(): Promise<string | null>;
    refreshSocketToken(reason: 'bootstrap' | 'socket-401' | 'reconnect'): Promise<string | null>;
    onRefreshFailed?(error: unknown): Promise<void> | void;
}
