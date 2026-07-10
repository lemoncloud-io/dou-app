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
    /**
     * The cloud id (cache cid space) this socket is bound to. Frozen at bind time and read back
     * via getBoundCid so cache writes can be attributed to the socket's ACTUAL cloud — a switch
     * flips the cache cid optimistically while the old cloud's socket (same url) stays attached,
     * and its frames must not be written under the new cloud's cid.
     */
    cid?: string;
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

export interface ISocketManager {
    ensure(config: SocketBindingConfig): ClientSocketV2;
    getClient(): ClientSocketV2 | null;
    getSnapshot(): SocketState;
    subscribe(listener: SocketStateListener): () => void;
    subscribeClient(listener: SocketClientListener): () => void;
    waitUntilVerified(timeoutMs?: number): Promise<boolean>;
    /**
     * Mirrors the SDK AuthController's `authenticated` state. `isVerified` is derived from this
     * AND the transport being connected, so re-authentication and connection drops both flow here.
     * Replaces the former manual markVerified/markUnverified pair.
     */
    setAuthenticated(value: boolean): void;
    connect(): Promise<void>;
    destroy(): void;

    /** The cloud id the live socket was bound to (frozen at bind), or null before the first bind. */
    getBoundCid(): string | null;
    // Stable request facade so gateways bind to these instead of a raw ClientSocketV2 and socket
    // replacement stays invisible to them. Recovery is owned by the SDK AuthController now, so the
    // request path no longer intercepts 401s or drives reconnects.
    request<T = unknown>(type: string, data?: unknown, options?: { timeoutMs?: number }): Promise<T>;
    send<T = unknown>(type: string | SocketMessage<T>, data?: T): void;
    onType<T = unknown>(type: string, listener: (message: SocketMessage<T>) => void): () => void;
    onMessage(listener: (event: ClientSocketMessageEvent) => void): () => void;
    onState(listener: (event: ClientSocketStateEvent) => void): () => void;
    onError(listener: (event: ClientSocketErrorEvent) => void): () => void;
    disconnect(code?: number, reason?: string): Promise<void>;
}

/**
 * Bridges the SDK AuthController to web-core. Owned by app-runtime
 * (connection/useSocketSessionDelegate), which wires it to web-core's active-server-aware helpers.
 *
 * - `getAuthRegistration` seeds `register({ token, authId })`.
 * - `signAuth` backs the SDK stateless sign callback (`target` is the switch selector).
 * - `commitRefreshedToken` writes an SDK-refreshed token back into the web-core stores. The view is
 *   the SDK `AuthTokenView`, typed here as `unknown` because that type is not exported from the SDK
 *   package root — the web-core boundary casts it to its own `UserTokenView`.
 * - `onAuthExpired` runs teardown when the SDK reaches the terminal `expired` state (active-server-aware).
 */
export interface SocketSessionDelegate {
    getAuthRegistration(): Promise<{ token: string; authId: string } | null>;
    signAuth(token: string, target?: string): Promise<{ signature: string; current: string }>;
    commitRefreshedToken(view: unknown): Promise<void> | void;
    onAuthExpired?(): Promise<void> | void;
}
