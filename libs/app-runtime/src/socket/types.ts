import type {
    ClientSocketErrorEvent,
    ClientSocketMessageEvent,
    ClientSocketState,
    ClientSocketStateEvent,
    ClientSocketV2,
    SocketMessage,
} from '@lemoncloud/chatic-sockets-lib';

/** Which server a socket slot serves. Dual sockets: relay is always-on, cloud is active-only. */
export type SocketKind = 'relay' | 'cloud';

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

/**
 * Dual-socket manager with an ACTIVE-FACADE interface (multi-socket-design.md §5-1): it holds a
 * relay slot (always) and a cloud slot (when cloud is active), but most methods operate on the
 * ACTIVE slot (cloud when present, else relay) so consumers (SyncManager/useSocketState/gateways/
 * the switch·logout·reauth helpers) stay socket-count-agnostic. Only slot lifecycle — ensure /
 * connect / setAuthenticated / destroy — is addressed per `kind`.
 */
export interface ISocketManager {
    /** Creates/reuses the slot for `kind` bound to `config`; returns that slot's client. */
    ensure(config: SocketBindingConfig, kind: SocketKind): ClientSocketV2;
    /**
     * A specific slot's client when `kind` is given (null if that slot is not bound), else the ACTIVE
     * slot's client (cloud when present, else relay). The per-kind form backs logout, which must
     * notify each server's own socket (§8-5/§8-6).
     */
    getClient(kind?: SocketKind): ClientSocketV2 | null;
    /** Observable state of the ACTIVE slot. */
    getSnapshot(): SocketState;
    subscribe(listener: SocketStateListener): () => void;
    /** Fires with the ACTIVE slot's client, and again whenever the active slot changes. */
    subscribeClient(listener: SocketClientListener): () => void;
    waitUntilVerified(timeoutMs?: number): Promise<boolean>;
    /**
     * Mirrors the SDK AuthController's `authenticated` state for a specific slot. The ACTIVE slot's
     * `isVerified` is derived from this AND that slot being connected. Replaces markVerified/markUnverified.
     */
    setAuthenticated(kind: SocketKind, value: boolean): void;
    /** Connects the slot for `kind` if idle/closed. */
    connect(kind: SocketKind): Promise<void>;
    /** Destroys one slot (`kind`) or, when omitted, all slots. */
    destroy(kind?: SocketKind): void;

    /** The cloud id the ACTIVE slot was bound to (frozen at bind), or null before the first bind. */
    getBoundCid(): string | null;
    // Stable request facade (ACTIVE slot) so gateways bind to these instead of a raw ClientSocketV2
    // and socket replacement stays invisible. Recovery is owned by the SDK AuthController now, so the
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
 * (connection/useSocketSessionDelegate), which wires it to web-core's per-server helpers. EVERY
 * method is keyed by the socket's `kind` so relay and cloud sockets, which bootstrap independently,
 * each seed/sign/write-back/expire against their OWN server — never the global active one
 * (multi-socket-design.md §6-6, §7).
 *
 * - `getAuthRegistration(kind)` seeds `register({ token, authId })` for that server.
 * - `signAuth(kind, token, target?)` backs the SDK stateless sign callback (`target` is the switch selector).
 * - `commitRefreshedToken(kind, view)` writes an SDK-refreshed token back into that server's store —
 *   so a refresh arriving during a switch/teardown lands in the correct store. The view is the SDK
 *   `AuthTokenView`, typed here as `unknown` because that type is not exported from the SDK package
 *   root — the web-core boundary casts it to its own `UserTokenView`.
 * - `onAuthExpired(kind)` runs teardown when a socket reaches the terminal `expired` state (relay vs
 *   cloud escalate differently — §6-10).
 */
export interface SocketSessionDelegate {
    getAuthRegistration(kind: SocketKind): Promise<{ token: string; authId: string } | null>;
    signAuth(kind: SocketKind, token: string, target?: string): Promise<{ signature: string; current: string }>;
    commitRefreshedToken(kind: SocketKind, view: unknown): Promise<void> | void;
    onAuthExpired?(kind: SocketKind): Promise<void> | void;
}
