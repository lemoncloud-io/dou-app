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

/** Fired per SLOT lifecycle: `client` on bind/rebuild, `null` when the slot is torn down. */
export type SocketSlotClientListener = (kind: SocketKind, client: ClientSocketV2 | null) => void;

/**
 * A stable request surface pinned to ONE slot kind (see getScopedClient). Mirrors the subset of
 * ISocketManager that gateways bind to, but every call resolves the slot lazily so it survives slot
 * teardown/rebuild. Deliberately request/send only — a kind-pinned push subscription (onType) would
 * need the active facade's owned-subscription rebinding; add it when a consumer exists. See
 * socket/kind-scoped-routing.md.
 */
export type ScopedSocketClient = Pick<ISocketManager, 'request' | 'send'>;

/**
 * Dual-socket manager with an ACTIVE-FACADE interface (multi-socket-design.md §5-1): it holds a
 * relay slot (always) and a cloud slot (when cloud is active), but most methods operate on the
 * ACTIVE slot (cloud when present, else relay) so consumers (SyncManager/useRuntimeSocketState/gateways/
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
    /**
     * A stable request facade pinned to ONE slot `kind`, regardless of which slot is active. Unlike
     * the active-facade methods (request/send = active slot), this always targets `kind` — e.g. a
     * relay-only write while a cloud slot is active. Resolves the slot lazily on each call so it
     * survives slot rebuild. See socket/kind-scoped-routing.md.
     */
    getScopedClient(kind: SocketKind): ScopedSocketClient;
    /** Observable state of the ACTIVE slot. */
    getSnapshot(): SocketState;
    subscribe(listener: SocketStateListener): () => void;
    /** Fires with the ACTIVE slot's client, and again whenever the active slot changes. */
    subscribeClient(listener: SocketClientListener): () => void;
    /**
     * Fires per SLOT client lifecycle — (kind, client) on bind/rebuild, (kind, null) just before a
     * teardown — independent of which slot is active, replaying currently bound slots on subscribe.
     * For any one mutation the slot notification precedes the active-client notification, so a
     * per-slot attachment (e.g. the SyncManager's slot runtime) exists by the time active-facade
     * consumers react. Backs per-slot runtimes that must survive active-slot switches: each slot's
     * device.save-on-connect and keepAlive/reconnect/rotation stay alive while backgrounded
     * (relay-while-cloud), which the ACTIVE-only subscribeClient cannot express.
     */
    subscribeSlotClients(listener: SocketSlotClientListener): () => void;
    waitUntilVerified(timeoutMs?: number): Promise<boolean>;
    /**
     * Per-kind counterpart of waitUntilVerified: resolves when THAT slot completes its handshake,
     * `false` on timeout, never rejects. Anything pinned to a slot via getScopedClient must gate on
     * this — waitUntilVerified would wait on cloud whenever a cloud session is up.
     */
    waitUntilKindVerified(kind: SocketKind, timeoutMs?: number): Promise<boolean>;
    /**
     * Mirrors the SDK AuthController's `authenticated` state for a specific slot. The ACTIVE slot's
     * `isVerified` is derived from this AND that slot being connected. Replaces markVerified/markUnverified.
     */
    setAuthenticated(kind: SocketKind, value: boolean): void;
    /**
     * Per-kind verification (authenticated AND connected) for the given slot, independent of which
     * slot is active — backs re-auth guards that target a non-active slot (relay while cloud is up).
     */
    isKindVerified(kind: SocketKind): boolean;
    /**
     * Continuous per-kind counterpart of waitUntilKindVerified: fires immediately with the current
     * value, then again on every change, until unsubscribed. Backs reactive consumers (e.g.
     * `useQuery({ enabled })`) of a getScopedClient-pinned request/send, which must re-gate on every
     * connect/disconnect — not just the first time, like the one-shot wait does.
     */
    subscribeKindVerified(kind: SocketKind, listener: (verified: boolean) => void): () => void;
    /** Connects the slot for `kind` if idle/closed. */
    connect(kind: SocketKind): Promise<void>;
    /** Destroys one slot (`kind`) or, when omitted, all slots. */
    destroy(kind?: SocketKind): void;

    /** The cloud id the ACTIVE slot was bound to (frozen at bind), or null before the first bind. */
    getBoundCid(): string | null;
    /**
     * Re-points a slot's bound cloud id without rebooting the socket — required for a same-wss cloud
     * switch (§8-4), where the url is unchanged so ensure() never re-runs to refresh boundCid.
     */
    rebindCid(kind: SocketKind, cid: string | null): void;
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
