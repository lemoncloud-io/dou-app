import type {
    ClientSocketErrorEvent,
    ClientSocketMessageEvent,
    ClientSocketState,
    ClientSocketStateEvent,
    ClientSocketV2,
    SocketMessage,
} from '@lemoncloud/chatic-sockets-lib';

/**
 * Which server a socket slot serves — relay (always-on) or a cloud (active-only). An ATTRIBUTE of a
 * slot, derived from its key (`kindOf`), never the key itself: relay and cloud authenticate, renew and
 * expire differently, but a slot is addressed by the cloud it serves.
 */
export type SocketKind = 'relay' | 'cloud';

/**
 * A socket slot's key: the id of the cloud it serves. The relay's is `RELAY_CLOUD_ID` (`'default'`),
 * the same value the cache partitions under (`RELAY_SLOT`).
 *
 * Branded so a bare string cannot pass for one. Slots used to be keyed `'relay' | 'cloud'`, and those
 * literals still type-check as `string` — a missed call site would then name a slot that never exists
 * and a subscription on it would wait forever, silently. Build one with `slotKeyOf(cid)`.
 */
export type SlotKey = string & { readonly __slotKey: never };

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
     * The cloud id this socket serves — and therefore the slot's key (`slotKeyOf(cid)`); the relay's is
     * `RELAY_CLOUD_ID`. Being the key is what freezes it: a slot is created for one cloud and reports
     * that cloud through getBoundCid for as long as it lives, so a switch that flips the cache cid
     * optimistically while the old socket is still attached cannot relabel that socket's frames.
     */
    cid: string;
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
export type SocketSlotClientListener = (key: SlotKey, client: ClientSocketV2 | null) => void;

/**
 * A stable surface pinned to ONE slot (see getScopedClient). Mirrors the subset of
 * ISocketManager that gateways bind to, but nothing captures a client: request/send resolve the
 * slot on every call, and `onType` registers a manager-owned subscription that follows the slot
 * across teardown/rebuild.
 */
export type ScopedSocketClient = Pick<ISocketManager, 'request' | 'send' | 'onType'>;

/**
 * Socket manager with an ACTIVE-FACADE interface: it holds a relay slot (always) and the slots of the
 * clouds its owner binds, keyed by the cloud each one serves, but most methods operate on the
 * ACTIVE slot (the one `setActiveSlot` names while it is bound, else relay) so consumers (SyncManager /
 * useRuntimeSocketState / gateways / the switch·logout·reauth helpers) stay socket-count-agnostic.
 * Slot lifecycle and the few things that must reach one specific server are addressed per `SlotKey`.
 */
export interface ISocketManager {
    // ── Slot lifecycle — addressed per slot.
    /** Creates/reuses the slot keyed by `config.cid` and bound to `config`; returns that slot's client. */
    ensure(config: SocketBindingConfig): ClientSocketV2;
    /** Connects the slot `key` if idle/closed. */
    connect(key: SlotKey): Promise<void>;
    /** Destroys one slot (`key`) or, when omitted, all slots. */
    destroy(key?: SlotKey): void;
    /**
     * Points the active facade at slot `key` (`null` = relay). Honoured while that slot is bound;
     * relay stands in otherwise. The binder calls it between binding an incoming slot and tearing
     * down the outgoing one, so the active client never passes through relay on a cloud switch.
     */
    setActiveSlot(key: SlotKey | null): void;
    /**
     * Mirrors the SDK AuthController's `authenticated` state for a specific slot. The ACTIVE slot's
     * `isVerified` is derived from this AND that slot being connected.
     */
    setAuthenticated(key: SlotKey, value: boolean): void;
    /** The keys of every bound slot — for work that must reach each server, e.g. logout or wake recovery. */
    getSlotKeys(): SlotKey[];

    // ── Request/push surface gateways bind to. Active-facade: the slot setActiveSlot names, else relay.
    request<T = unknown>(type: string, data?: unknown, options?: { timeoutMs?: number }): Promise<T>;
    send<T = unknown>(type: string | SocketMessage<T>, data?: T): void;
    onType<T = unknown>(type: string, listener: (message: SocketMessage<T>) => void): () => void;
    /**
     * Push subscription pinned to ONE slot, for events a specific server delivers regardless of which
     * slot is active (e.g. a relay-only unicast while a cloud slot is up). The manager owns the entry
     * and re-binds it whenever that slot is rebuilt.
     *
     * Unlike the slot-pinned request/send, registering against an unbound slot does NOT throw: a
     * subscription is a standing declaration ("attach when this slot exists"), and the relay slot is
     * briefly absent during boot. It waits, and never leaks onto another slot.
     */
    onSlotType<T = unknown>(key: SlotKey, type: string, listener: (message: SocketMessage<T>) => void): () => void;
    onMessage(listener: (event: ClientSocketMessageEvent) => void): () => void;
    onState(listener: (event: ClientSocketStateEvent) => void): () => void;
    onError(listener: (event: ClientSocketErrorEvent) => void): () => void;
    disconnect(code?: number, reason?: string): Promise<void>;

    // ── Everything an observer reads or subscribes to — no lifecycle, no sending.
    /**
     * A specific slot's client when `key` is given (null if that slot is not bound), else the ACTIVE
     * slot's client. The per-slot form backs logout, which must notify each server's own socket.
     */
    getClient(key?: SlotKey): ClientSocketV2 | null;
    /**
     * A stable request facade pinned to ONE slot, regardless of which slot is active. Unlike the
     * active-facade methods (request/send = active slot), this always targets `key` — e.g. a
     * relay-only write while a cloud slot is active. Resolves the slot lazily on each call so it
     * survives slot rebuild.
     */
    getScopedClient(key: SlotKey): ScopedSocketClient;
    /** Observable state of the ACTIVE slot. */
    getSnapshot(): SocketState;
    subscribe(listener: SocketStateListener): () => void;
    /** Fires with the ACTIVE slot's client, and again whenever the active slot changes. */
    subscribeClient(listener: SocketClientListener): () => void;
    /**
     * Fires per SLOT client lifecycle — (key, client) on bind/rebuild, (key, null) just before a
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
     * Per-slot counterpart of waitUntilVerified: resolves when THAT slot completes its handshake,
     * `false` on timeout, never rejects. Anything pinned to a slot via getScopedClient must gate on
     * this — waitUntilVerified would wait on cloud whenever a cloud session is up.
     */
    waitUntilSlotVerified(key: SlotKey, timeoutMs?: number): Promise<boolean>;
    /**
     * Per-slot verification (authenticated AND connected), independent of which slot is active —
     * backs re-auth guards that target a non-active slot (relay while cloud is up).
     */
    isSlotVerified(key: SlotKey): boolean;
    /**
     * Continuous per-slot counterpart of waitUntilSlotVerified: fires immediately with the current
     * value, then again on every change, until unsubscribed. Backs reactive consumers (e.g.
     * `useQuery({ enabled })`) of a getScopedClient-pinned request/send, which must re-gate on every
     * connect/disconnect — not just the first time, like the one-shot wait does.
     */
    subscribeSlotVerified(key: SlotKey, listener: (verified: boolean) => void): () => void;

    // ── The cache-attribution observation `ActiveScope` needs.
    /** The cloud id the ACTIVE slot serves — its key — or null before the first bind. */
    getBoundCid(): string | null;
}
