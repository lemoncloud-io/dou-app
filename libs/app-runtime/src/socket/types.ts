import type { ClientSocketState, ClientSocketV2 } from '@lemoncloud/chatic-sockets-lib';

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
 * Connection fields follow ClientSocketV2; handshake fields (`isVerified`,
 * `isDeviceRegistered`, `connectionId`) are derived from app-level acknowledgements.
 */
export interface SocketState {
    /** Raw transport state. */
    state: ClientSocketState;
    /** Shorthand for `state === 'connected'`. */
    isConnected: boolean;
    /** True once `auth.update:ok` has been acknowledged for this connection. */
    isVerified: boolean;
    /** True once `device.save:ok` / `device.read:ok` has been acknowledged. */
    isDeviceRegistered: boolean;
    /** Server-assigned connection id, when known. */
    connectionId: string | null;
}

export type SocketStateListener = (state: SocketState) => void;

export type SocketClientListener = (client: ClientSocketV2 | null) => void;

export interface ISocketManager {
    ensure(config: SocketBindingConfig): ClientSocketV2;
    getClient(): ClientSocketV2 | null;
    getSnapshot(): SocketState;
    subscribe(listener: SocketStateListener): () => void;
    subscribeClient(listener: SocketClientListener): () => void;
    markVerified(): void;
    markUnverified(): void;
    markDeviceRegistered(connectionId?: string): void;
    connect(): Promise<void>;
    destroy(): void;
}

export interface SocketSessionDelegate {
    getSocketToken(): Promise<string | null>;
    refreshSocketToken(reason: 'bootstrap' | 'socket-401' | 'reconnect'): Promise<string | null>;
    onRefreshFailed?(error: unknown): Promise<void> | void;
}
