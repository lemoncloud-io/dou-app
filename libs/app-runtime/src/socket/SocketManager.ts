import {
    type ClientSocketErrorEvent,
    type ClientSocketMessageEvent,
    type ClientSocketState,
    type ClientSocketStateEvent,
    type ClientSocketV2,
    type SocketMessage,
    createClientSocketV2,
} from '@lemoncloud/chatic-sockets-lib';

import { logger } from '@chatic/bridges';
import { pageHideCount, perfNow } from '@chatic/perf';
import type {
    ISocketManager,
    ScopedSocketClient,
    SocketBindingConfig,
    SlotKey,
    SlotStatus,
    SocketClientListener,
    SocketKind,
    SocketRequestSample,
    SocketSlotClientListener,
    SocketState,
    SocketStateListener,
} from './types';
import { AUTH_OPTIONS, DEFAULT_VERIFY_TIMEOUT_MS, INITIAL_SOCKET_STATE } from './constants';
import { socketFailureReporter } from './socketFailureReporter';
import { annotateSocketError } from './utils/annotateSocketError';
import { getSocketErrorCode } from './utils/socketErrorCode';
import { RELAY_SLOT, kindOf, slotKeyOf } from './utils/slotKey';

/** A push subscription that must be re-bound whenever the active client is replaced. */
type TypeListenerEntry = {
    type: string;
    listener: (message: SocketMessage<any>) => void;
    unsubscribe?: () => void;
};

/** The same, pinned to ONE slot: re-bound on that slot's rebuild rather than on active change. */
type SlotTypeListenerEntry = TypeListenerEntry & { key: SlotKey };

/** One managed socket slot (relay or cloud). Each slot owns its own SDK client + connection state. */
interface ClientEntry {
    client: ClientSocketV2;
    config: SocketBindingConfig;
    /**
     * Mirrors this slot's SDK AuthController authenticated flag (via setAuthenticated), scoped to the
     * CURRENT connection — any transport state other than `connected` clears it (see bindEntry).
     */
    authenticated: boolean;
    /** Latest transport state for this slot (from its onState). */
    connState: ClientSocketState;
    /** `connected` transitions since bind — reconnect-churn telemetry (2026-08 session audit §7 Phase 0). */
    connectCount: number;
    unsubscribes: Array<() => void>;
}

/**
 * SocketManager owns ClientSocketV2 slots keyed by the cloud each serves — the relay's (always-on)
 * and the committed cloud's — and exposes an ACTIVE-FACADE: the observable state, request/send/onType,
 * and subscribeClient all track the ACTIVE slot. Slot lifecycle (ensure/connect/setAuthenticated/
 * destroy) is per slot. Each SDK client is fully independent; do NOT share a timerScheduler between
 * them — the factory gives each its own.
 *
 * **Which slot is active is a pointer the owner sets** (`setActiveSlot`), not something inferred
 * from which slots happen to be bound. Inference only worked while there could be one cloud slot:
 * "the cloud slot if any" stops naming anything the moment two exist, even for the instant a switch
 * binds the incoming cloud before the outgoing one is torn down. The manager itself no longer limits
 * how many cloud slots are bound; `SocketBinder` binds the ones the session asks for.
 */
export class SocketManager implements ISocketManager {
    private readonly entries = new Map<SlotKey, ClientEntry>();
    private state: SocketState = INITIAL_SOCKET_STATE;

    // State is an observable store: each consumer (e.g. a useSyncExternalStore hook) registers its
    // own listener — hence a Set.
    private readonly stateListeners = new Set<SocketStateListener>();
    // Active-client listeners (e.g. SyncManager). Fired with the ACTIVE client on every active change.
    private readonly clientListeners = new Set<SocketClientListener>();
    // Per-slot client listeners (e.g. the SyncManager's slot runtimes). Fired on every slot bind /
    // rebuild / teardown regardless of which slot is active — see subscribeSlotClients.
    private readonly slotClientListeners = new Set<SocketSlotClientListener>();
    // Per-slot verification listeners, fired whenever a slot's authenticated/connected inputs move —
    // for ANY slot, not just the active one. Backs waitUntilSlotVerified; the active-slot
    // stateListeners above cannot express "relay is up" while a cloud slot is active.
    private readonly slotVerifiedListeners = new Set<(key: SlotKey) => void>();
    // Push subscriptions registered via onType. Owned here so they survive active-client changes —
    // re-bound to the active client whenever the active slot changes.
    private readonly typeListeners = new Set<TypeListenerEntry>();
    // Push subscriptions registered via onSlotType. Owned here for the same reason, but keyed to ONE
    // slot: re-bound from notifySlotClient (the single choke point both ensure() and teardownEntry()
    // pass through) instead of from active-slot changes.
    private readonly slotTypeListeners = new Set<SlotTypeListenerEntry>();
    // The slot the owner asked to be active (setActiveSlot). It may name a slot that is not bound
    // yet — the effective active slot is derived from it on every read (getActiveKey).
    private requestedActive: SlotKey | null = null;
    // The effective active slot as of the last syncActive, so a move is logged once, when it happens.
    private lastActiveKey: SlotKey | null = null;
    // Who is told each request's round trip (setRequestObserver). Unset, requests read no clock.
    private requestObserver: ((sample: SocketRequestSample) => void) | undefined;

    /**
     * Ensures the slot keyed by `config.cid` is bound to `config`. Reuses the slot when its config is
     * unchanged; otherwise tears it down and builds a fresh client. Returns that slot's client.
     *
     * Other slots are left alone, including another cloud's: a switch binds the incoming cloud here,
     * moves the active pointer, and only then tears the outgoing one down, so the active client goes
     * from one cloud straight to the other — never through relay.
     */
    public ensure(config: SocketBindingConfig): ClientSocketV2 {
        const key = slotKeyOf(config.cid);
        // The key decides which server a slot serves, so a config claiming the other one is a bug
        // upstream — most likely a cloud config that fell back to the relay's cid. Building it would
        // tear down the relay slot and install a cloud socket in its place.
        if (config.wssType && config.wssType !== kindOf(key)) {
            throw new Error(`[SocketManager] a ${config.wssType} config cannot bind the ${kindOf(key)} slot "${key}"`);
        }
        const existing = this.entries.get(key);
        if (existing && this.isSameConfig(existing.config, config)) {
            return existing.client;
        }

        const prevActiveClient = this.getActiveClient();
        if (existing) {
            this.teardownEntry(key);
        }

        const client = this.createClient(config);
        const entry: ClientEntry = {
            client,
            config,
            authenticated: false,
            connState: client.state,
            connectCount: 0,
            unsubscribes: [],
        };
        this.entries.set(key, entry);
        this.bindEntry(key, entry);
        logger.info('SOCKET', '[SocketManager] slot bound', { data: { cid: key, kind: kindOf(key) } });

        // Slot notification BEFORE the active-facade sync: per-slot attachments (slot runtimes)
        // must exist by the time active-client listeners replay work onto them.
        this.notifySlotClient(key, client);
        this.syncActive(prevActiveClient);
        return client;
    }

    /**
     * Points the active facade at slot `key`; `null` asks for relay. The effective active slot is
     * `key` while it is bound and relay otherwise, so the pointer can be set before its slot binds
     * and it is honoured the moment the slot appears.
     *
     * Always resyncs, even when the pointer does not move: the effective slot is derived, and a
     * resync is how a derived change reaches the state and client listeners.
     */
    public setActiveSlot(key: SlotKey | null): void {
        const prevActiveClient = this.getActiveClient();
        this.requestedActive = key;
        this.syncActive(prevActiveClient);
    }

    /**
     * A specific slot's client when `key` is given (null if unbound), else the ACTIVE slot's client. Logout uses the per-slot form to notify each server's socket.
     */
    public getClient(key?: SlotKey): ClientSocketV2 | null {
        if (key) {
            return this.entries.get(key)?.client ?? null;
        }
        return this.getActiveClient();
    }

    public getSlotKeys(): SlotKey[] {
        return [...this.entries.keys()];
    }

    /**
     * The cloud the ACTIVE slot serves, or null before the first bind. It is the slot's key, so it is
     * fixed for the slot's whole life: a switch that flips the cache cid first cannot relabel the
     * outgoing socket, whose frames keep being attributed to the cloud it actually serves.
     */
    public getBoundCid(): string | null {
        return this.getActiveKey();
    }

    /**
     * A stable request facade pinned to ONE slot, independent of the active slot. Every call
     * re-resolves the slot's client (lazy), so it survives slot teardown/rebuild via ensure() —
     * capturing the client eagerly would leave callers on a stale socket. Used for requests that must
     * target a specific server regardless of which slot is active (e.g. a relay-only write while a
     * cloud slot is active). `send` is supported symmetrically, and `onType` delegates to the
     * manager-owned onSlotType so a pinned subscription survives slot rebuilds.
     */
    public getScopedClient(key: SlotKey): ScopedSocketClient {
        // Labels stay `relay`/`cloud`: failure messages are read by people, and the slot's cloud id
        // is carried in the reporter's data instead.
        const kind = kindOf(key);
        const requireSlot = (action: string): ClientSocketV2 => {
            const client = this.entries.get(key)?.client;
            if (!client) {
                throw new Error(`[SocketManager] no ${kind} slot bound for ${action}`);
            }
            return client;
        };
        return {
            // requireSlot stays OUTSIDE the promise chain: an unbound slot must keep throwing
            // synchronously (no silent fallback — see SocketManager.test.ts), so this is deliberately
            // not an async arrow.
            request: <T = unknown>(type: string, data?: unknown, options?: { timeoutMs?: number }): Promise<T> => {
                const client = requireSlot(`request(${type})`);
                const settle = this.timeRequest(kind, type);
                return (client.request(type as any, data as any, options) as Promise<T>).then(
                    value => {
                        settle();
                        socketFailureReporter.recordSuccess(key);
                        return value;
                    },
                    error => {
                        settle(error);
                        // Annotated BEFORE it is reported, so the entry's `error` carries the
                        // caller's name too. The annotator only appends, so the leading status the
                        // reporter classifies on is untouched.
                        const annotated = annotateSocketError(error, kind, 'request', type);
                        socketFailureReporter.recordFailure(key, 'request', type, annotated);
                        throw annotated;
                    }
                );
            },
            send: <T = unknown>(type: string | SocketMessage<T>, data?: T): void => {
                const client = requireSlot('send()');
                const name = typeof type === 'string' ? type : type.type;
                try {
                    if (typeof type === 'string') {
                        client.send(type as any, data as any);
                        socketFailureReporter.recordSuccess(key);
                        return;
                    }
                    client.send(type);
                    // A send the transport accepted proves the slot is connected, which is the only
                    // thing the streak tracks — so it clears one, same as a successful request.
                    socketFailureReporter.recordSuccess(key);
                } catch (error) {
                    const annotated = annotateSocketError(error, kind, 'send', name);
                    socketFailureReporter.recordFailure(key, 'send', name, annotated);
                    throw annotated;
                }
            },
            // No requireSlot: a subscription waits for its slot instead of throwing (see onSlotType).
            onType: <T = unknown>(type: string, listener: (message: SocketMessage<T>) => void): (() => void) =>
                this.onSlotType<T>(key, type, listener),
        };
    }

    /** Observable state snapshot of the ACTIVE slot. */
    public getSnapshot(): SocketState {
        return this.state;
    }

    /**
     * Whether a SPECIFIC slot is auth-verified (authenticated AND connected). getSnapshot() only
     * reflects the ACTIVE slot; a per-slot guard (e.g. a relay re-auth while a cloud slot is active)
     * must read the target slot, not the active one.
     */
    public isSlotVerified(key: SlotKey): boolean {
        const entry = this.entries.get(key);
        if (!entry) return false;
        return entry.authenticated && entry.connState === 'connected';
    }

    public getSlotStatuses(): SlotStatus[] {
        const active = this.getActiveKey();
        return [...this.entries]
            .map(([key, entry]) => ({
                key,
                kind: kindOf(key),
                active: key === active,
                state: entry.connState,
                verified: entry.authenticated && entry.connState === 'connected',
                connectCount: entry.connectCount,
            }))
            .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'relay' ? -1 : 1));
    }

    /** Subscribes to ACTIVE-slot state changes. Fires immediately with the current snapshot. */
    public subscribe(listener: SocketStateListener): () => void {
        this.stateListeners.add(listener);
        listener(this.state);
        return () => {
            this.stateListeners.delete(listener);
        };
    }

    /**
     * Resolves once the ACTIVE slot is auth-verified (handshake complete), or after `timeoutMs`.
     * Resolves `true` when verified and `false` on timeout — never rejects, so callers gating an
     * action can fall back to best-effort. Resolves synchronously when already verified.
     */
    public waitUntilVerified(timeoutMs: number = DEFAULT_VERIFY_TIMEOUT_MS): Promise<boolean> {
        if (this.state.isVerified) {
            return Promise.resolve(true);
        }
        return new Promise<boolean>(resolve => {
            let settled = false;
            let unsubscribe: (() => void) | null = null;
            const finish = (verified: boolean) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                unsubscribe?.();
                resolve(verified);
            };
            const timer = setTimeout(() => finish(false), timeoutMs);
            unsubscribe = this.subscribe(state => {
                if (state.isVerified) finish(true);
            });
        });
    }

    /**
     * The per-slot counterpart of waitUntilVerified: resolves once THAT slot is auth-verified, or
     * `false` after `timeoutMs`. Never rejects, so a caller gating a request can still proceed
     * best-effort and let the real server error surface.
     *
     * Required by anything pinned to a slot via getScopedClient — waitUntilVerified tracks the
     * ACTIVE slot, so gating a relay-pinned request with it would wait on cloud whenever a cloud
     * session is up and fire at relay while its handshake is still in flight.
     */
    public waitUntilSlotVerified(key: SlotKey, timeoutMs: number = DEFAULT_VERIFY_TIMEOUT_MS): Promise<boolean> {
        if (this.isSlotVerified(key)) {
            return Promise.resolve(true);
        }
        return new Promise<boolean>(resolve => {
            let settled = false;
            const finish = (verified: boolean) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                this.slotVerifiedListeners.delete(onChange);
                resolve(verified);
            };
            const timer = setTimeout(() => finish(false), timeoutMs);
            const onChange = (changed: SlotKey) => {
                if (changed === key && this.isSlotVerified(key)) finish(true);
            };
            this.slotVerifiedListeners.add(onChange);
        });
    }

    /**
     * Continuous per-slot counterpart of waitUntilSlotVerified: fires immediately with THAT slot's
     * current verified value, then again on every change to it, until unsubscribed.
     *
     * waitUntilSlotVerified only resolves once — fine for a one-shot gate before a single request,
     * but useless for a reactive consumer (e.g. `useQuery({ enabled })`) that must re-fire on the
     * false→true edge every time the slot drops and reconnects, not just the first time. Backs any
     * such consumer of a getScopedClient-pinned request/send.
     */
    public subscribeSlotVerified(key: SlotKey, listener: (verified: boolean) => void): () => void {
        listener(this.isSlotVerified(key));
        const onChange = (changed: SlotKey) => {
            if (changed === key) listener(this.isSlotVerified(key));
        };
        this.slotVerifiedListeners.add(onChange);
        return () => {
            this.slotVerifiedListeners.delete(onChange);
        };
    }

    /**
     * Subscribes to ACTIVE-client replacement (bind, active-slot switch, teardown). Fires immediately
     * with the current active client. Used by the sync adapter to re-bind its runtime to the active
     * socket (relay auth-only slot never becomes the sync target unless it is active).
     */
    public subscribeClient(listener: SocketClientListener): () => void {
        this.clientListeners.add(listener);
        listener(this.getActiveClient());
        return () => {
            this.clientListeners.delete(listener);
        };
    }

    /**
     * Subscribes to per-SLOT client lifecycle (see ISocketManager.subscribeSlotClients). Replays the
     * currently bound slots immediately so a late subscriber still attaches to live clients.
     */
    public subscribeSlotClients(listener: SocketSlotClientListener): () => void {
        this.slotClientListeners.add(listener);
        for (const [key, entry] of this.entries) {
            listener(key, entry.client);
        }
        return () => {
            this.slotClientListeners.delete(listener);
        };
    }

    /**
     * Mirrors the SDK AuthController's authenticated state for slot `key` (wired via onAuthState in
     * bootstrapSocketConnection). When `key` is the active slot, `isVerified` is recomputed from
     * this AND that slot being connected.
     */
    public setAuthenticated(key: SlotKey, value: boolean): void {
        const entry = this.entries.get(key);
        if (!entry) return;
        entry.authenticated = value;
        this.notifySlotVerified(key);
        if (this.getActiveKey() === key) {
            this.setState(this.computeState(entry));
        }
    }

    /** Connects slot `key` if it is idle or closed. */
    public async connect(key: SlotKey): Promise<void> {
        const entry = this.entries.get(key);
        if (!entry) return;
        if (entry.client.state === 'idle' || entry.client.state === 'closed') {
            await entry.client.connect();
        }
    }

    /**
     * Stable request facade (ACTIVE slot). The SDK AuthController owns re-authentication and the
     * transport owns reconnect, so this no longer intercepts 401s or drives manual reconnect/retry —
     * it names the caller on the way out (annotateSocketError), because the SDK's failures do not
     * carry the request type, and it reports the failure (socketFailureReporter).
     *
     * Reporting belongs here rather than at the call sites because this is the only place every
     * socket request passes through, and because a rejection is otherwise the end of the story: the
     * SDK does not emit a server `*:error` frame to `onError`, so nothing downstream is guaranteed
     * to record it. See `socketFailureReporter`.
     */
    public async request<T = unknown>(type: string, data?: unknown, options?: { timeoutMs?: number }): Promise<T> {
        const client = this.requireActiveClient(`request(${type})`);
        // requireActiveClient has just proven an active slot exists.
        const key = this.getActiveKey()!;
        const settle = this.timeRequest(kindOf(key), type);
        try {
            const value = (await client.request(type as any, data as any, options)) as T;
            settle();
            socketFailureReporter.recordSuccess(key);
            return value;
        } catch (error) {
            settle(error);
            const annotated = annotateSocketError(error, kindOf(key), 'request', type);
            socketFailureReporter.recordFailure(key, 'request', type, annotated);
            throw annotated;
        }
    }

    public setRequestObserver(observer: ((sample: SocketRequestSample) => void) | undefined): void {
        this.requestObserver = observer;
    }

    /**
     * Starts timing one request for the observer, and returns what settles it: no argument for an
     * answer, the error for a rejection. The observer is the one set when the request left, so a
     * request in flight across a change reports where it started.
     *
     * A request the page was hidden during is not handed over: its round trip would include the time
     * the OS kept the page suspended. And the observer cannot change what the caller sees — one that
     * throws is logged, never turned into the request's failure.
     */
    private timeRequest(kind: SocketKind, type: string): (error?: unknown) => void {
        const observer = this.requestObserver;
        if (!observer) return () => undefined;
        const startedAt = perfNow();
        const hidesAtStart = pageHideCount();
        let settled = false;
        return (...args: [unknown?]) => {
            if (settled || pageHideCount() !== hidesAtStart) return;
            settled = true;
            const outcome = args.length === 0 ? 'ok' : String(getSocketErrorCode(args[0]) ?? 'error');
            try {
                observer({ type, kind, outcome, roundTripMs: Math.round(perfNow() - startedAt) });
            } catch (error) {
                logger.warn('SOCKET', '[SocketManager] request observer threw', { error, data: { type } });
            }
        };
    }

    public send<T = unknown>(type: string | SocketMessage<T>, data?: T): void {
        const client = this.requireActiveClient('send()');
        const key = this.getActiveKey()!;
        const name = typeof type === 'string' ? type : type.type;
        try {
            if (typeof type === 'string') {
                client.send(type as any, data as any);
                socketFailureReporter.recordSuccess(key);
                return;
            }
            client.send(type);
            socketFailureReporter.recordSuccess(key);
        } catch (error) {
            const annotated = annotateSocketError(error, kindOf(key), 'send', name);
            socketFailureReporter.recordFailure(key, 'send', name, annotated);
            throw annotated;
        }
    }

    /**
     * Registers a push subscription that survives active-client replacement. The entry is owned by
     * the manager and re-bound to the active client on every active-slot change.
     */
    public onType<T = unknown>(type: string, listener: (message: SocketMessage<T>) => void): () => void {
        const entry: TypeListenerEntry = {
            type,
            listener: listener as (message: SocketMessage<any>) => void,
        };
        this.typeListeners.add(entry);
        this.bindTypeListener(entry, this.getActiveClient());

        return () => {
            entry.unsubscribe?.();
            this.typeListeners.delete(entry);
        };
    }

    /**
     * Registers a push subscription pinned to ONE slot, for events a specific server delivers
     * regardless of which slot is active. The entry is owned by the manager and re-bound whenever
     * that slot is rebuilt — capturing the client here would leave the listener on a dead socket
     * after the first reconnect.
     *
     * Registering against an unbound slot is NOT an error (unlike getScopedClient's request/send):
     * the entry waits and binds when the slot appears. It never falls back to another slot.
     */
    public onSlotType<T = unknown>(
        key: SlotKey,
        type: string,
        listener: (message: SocketMessage<T>) => void
    ): () => void {
        const entry: SlotTypeListenerEntry = {
            key,
            type,
            listener: listener as (message: SocketMessage<any>) => void,
        };
        this.slotTypeListeners.add(entry);
        this.bindSlotTypeListener(entry, this.entries.get(key)?.client ?? null);

        return () => {
            entry.unsubscribe?.();
            this.slotTypeListeners.delete(entry);
        };
    }

    public onMessage(listener: (event: ClientSocketMessageEvent) => void): () => void {
        return this.requireActiveClient('onMessage()').onMessage(listener);
    }

    public onState(listener: (event: ClientSocketStateEvent) => void): () => void {
        return this.requireActiveClient('onState()').onState(listener);
    }

    public onError(listener: (event: ClientSocketErrorEvent) => void): () => void {
        return this.requireActiveClient('onError()').onError(listener);
    }

    public disconnect(code?: number, reason?: string): Promise<void> {
        return this.requireActiveClient('disconnect()').disconnect(code, reason);
    }

    /**
     * Destroys one slot (`key`) or, when omitted, all slots, and resets state. Destroying the slot the
     * active pointer names leaves the pointer in place — the facade falls back to relay until that
     * slot is bound again or the owner points elsewhere. Destroying everything clears it.
     */
    public destroy(key?: SlotKey): void {
        const prevActiveClient = this.getActiveClient();
        if (key) {
            this.teardownEntry(key);
        } else {
            for (const key of [...this.entries.keys()]) {
                this.teardownEntry(key);
            }
            this.requestedActive = null;
        }
        this.syncActive(prevActiveClient);
    }

    // --- active-slot derivation -------------------------------------------------------------

    /** The requested slot while it is bound, else relay's, else none. */
    private getActiveKey(): SlotKey | null {
        if (this.requestedActive && this.entries.has(this.requestedActive)) return this.requestedActive;
        return this.entries.has(RELAY_SLOT) ? RELAY_SLOT : null;
    }

    private getActiveEntry(): ClientEntry | null {
        const key = this.getActiveKey();
        return key ? (this.entries.get(key) ?? null) : null;
    }

    private getActiveClient(): ClientSocketV2 | null {
        return this.getActiveEntry()?.client ?? null;
    }

    private computeState(entry: ClientEntry | null): SocketState {
        if (!entry) return INITIAL_SOCKET_STATE;
        const connected = entry.connState === 'connected';
        return {
            state: entry.connState,
            isConnected: connected,
            // isVerified = authenticated && connected, so a drop clears it and a reconnect restores
            // it once the SDK re-authenticates (onAuthState → setAuthenticated).
            isVerified: entry.authenticated && connected,
            connectionId: null,
        };
    }

    /**
     * Recomputes the observable state from the (possibly new) active slot, and — when the active
     * client actually changed — re-binds owned onType subscriptions to it and notifies client listeners.
     */
    private syncActive(prevActiveClient: ClientSocketV2 | null): void {
        const activeKey = this.getActiveKey();
        if (activeKey !== this.lastActiveKey) {
            const entry = activeKey ? this.entries.get(activeKey) : undefined;
            logger.info('SOCKET', '[SocketManager] active moved', {
                data: {
                    from: this.lastActiveKey,
                    cid: activeKey,
                    kind: activeKey ? kindOf(activeKey) : null,
                    connectCount: entry?.connectCount ?? null,
                },
            });
            this.lastActiveKey = activeKey;
        }
        this.setState(this.computeState(this.getActiveEntry()));

        const activeClient = this.getActiveClient();
        if (activeClient === prevActiveClient) return;
        // Rebind type listeners first so consumers reacting to the client change observe an
        // already-consistent subscription state.
        this.rebindTypeListeners(activeClient);
        for (const listener of this.clientListeners) {
            listener(activeClient);
        }
    }

    // --- slot binding / teardown ------------------------------------------------------------

    /** Binds connection + error listeners for a slot, routing them into the active-slot state. */
    private bindEntry(key: SlotKey, entry: ClientEntry): void {
        const kind = kindOf(key);
        entry.unsubscribes.push(
            entry.client.onState((event: ClientSocketStateEvent) => {
                entry.connState = event.next;
                // Leaving `connected` invalidates the auth flag, because the server authenticates a
                // CONNECTION, not a device: the next socket starts unauthenticated until its own
                // `auth.update` lands. The SDK AuthController emits no state change on a transport
                // drop (it only clears timers), so without this the flag stays `authenticated` from
                // the dead connection and `isSlotVerified` goes true the instant the transport
                // reconnects — before device.save:ok → auth.update. Anything gated on it then fires
                // into that window and the server answers `401 UNAUTHORIZED - not authenticated`
                // (observed on relay-pinned `invite.list`). The flag is restored by the controller's
                // own `authenticated` emission after the handshake.
                if (event.next !== 'connected') {
                    entry.authenticated = false;
                }
                if (event.next === 'connected') {
                    entry.connectCount += 1;
                    // One line per (re)connect: a reconnect storm (server dropping failed-auth
                    // sockets, wake flapping) shows up as a fast-growing count for one slot.
                    if (entry.connectCount > 1) {
                        logger.info('SOCKET', '[SocketManager] reconnected', {
                            data: { kind, cid: key, connectCount: entry.connectCount },
                        });
                    }
                }
                this.notifySlotVerified(key);
                // Only the active slot drives the observable state; background (relay-while-cloud)
                // transport changes are tracked on the entry but not surfaced.
                if (this.getActiveKey() === key) {
                    this.setState(this.computeState(entry));
                }
            })
        );

        entry.unsubscribes.push(
            entry.client.onError((event: ClientSocketErrorEvent) => {
                // A `request` failure reaches the caller as well: the SDK calls
                // `pending.reject` and this emitter with the SAME error object,
                // rejection first. But the rejection resumes in a microtask, so
                // this listener runs BEFORE `annotateSocketError` appends the
                // call — logging it at error level would leave two entries for
                // one failure, and the one that lands first is the anonymous
                // `503 SOCKET NOT CONNECTED - WebSocketTransport.send()` with no
                // hint of which request it was. It also doubles the cost: error
                // entries flush the log persistence immediately.
                //
                // Kept at warn rather than dropped, because a caller is free to
                // swallow its rejection and this would be the only trace left.
                // Other phases have no such second path and stay at error.
                const fields = { error: event.error, data: { kind, cid: key, phase: event.phase } };

                if (event.phase === 'request') {
                    logger.warn('SOCKET', '[SocketManager] Socket error', fields);
                    return;
                }
                logger.error('SOCKET', '[SocketManager] Socket error', fields);
            })
        );

        this.bindReconnectDiagnostics(key, entry);
    }

    /**
     * Subscribes to the SDK reconnect controller's failure signals — "why did it drop" is the one
     * question the entries above cannot answer. `onState` reports that a socket reconnected, and
     * `onError` reports frame-level failures, but a controller that retries and eventually gives up
     * does so silently: the slot simply stays down.
     *
     * **Feature-detected on purpose.** `onConnectFailed`/`onGiveUp` exist on the controller the SDK
     * currently constructs, but NOT on the `ReconnectController` interface it publishes (which is
     * `start`/`stop`/`restart`). Reaching them is therefore a runtime fact, not a typed contract, and
     * a future SDK could swap the controller and drop them — so a missing method is skipped rather
     * than crashing the bind. The proper fix is for the SDK to widen the interface; until then this
     * degrades to the coverage we already had.
     */
    private bindReconnectDiagnostics(key: SlotKey, entry: ClientEntry): void {
        const kind = kindOf(key);
        const controller = entry.client.reconnect as
            | {
                  onConnectFailed?: (listener: (event: { attempt: number; error: unknown }) => void) => () => void;
                  onGiveUp?: (listener: (event: { attempts: number }) => void) => () => void;
              }
            | undefined;
        if (!controller) return;

        if (typeof controller.onConnectFailed === 'function') {
            entry.unsubscribes.push(
                controller.onConnectFailed(event => {
                    logger.warn('SOCKET', '[SocketManager] reconnect attempt failed', {
                        error: event.error,
                        data: { kind, cid: key, attempt: event.attempt },
                    });
                })
            );
        }

        if (typeof controller.onGiveUp === 'function') {
            entry.unsubscribes.push(
                // Terminal: nothing retries after this, so a slot that is "just quiet" and a slot
                // that has permanently stopped reconnecting look identical without this line.
                controller.onGiveUp(event => {
                    logger.error('SOCKET', '[SocketManager] reconnect gave up', {
                        data: { kind, cid: key, attempts: event.attempts },
                    });
                })
            );
        }
    }

    /** Announces that slot `key`'s verification inputs moved; waiters re-read isSlotVerified themselves. */
    private notifySlotVerified(key: SlotKey): void {
        for (const listener of this.slotVerifiedListeners) {
            listener(key);
        }
    }

    private teardownEntry(key: SlotKey): void {
        const entry = this.entries.get(key);
        if (!entry) return;
        const kind = kindOf(key);

        // Notify while the client is still alive so listeners can detach cleanly (e.g. a slot
        // runtime stopping its controllers) before destroy() tears the transport down.
        this.notifySlotClient(key, null);

        for (const unsubscribe of entry.unsubscribes) {
            try {
                unsubscribe();
            } catch (error) {
                logger.warn('SOCKET', '[SocketManager] Failed to unsubscribe socket listener', {
                    error,
                    data: { kind, cid: key },
                });
            }
        }
        try {
            entry.client.destroy();
        } catch (error) {
            logger.warn('SOCKET', '[SocketManager] Failed to destroy socket client', {
                error,
                data: { kind, cid: key },
            });
        }
        this.entries.delete(key);
        logger.info('SOCKET', '[SocketManager] slot torn down', {
            data: { cid: key, kind, connectCount: entry.connectCount },
        });
        // A streak describes one connection's absence; with the slot gone there is nothing left for it
        // to describe, and keeping it would let a later slot for the same cloud inherit the count.
        socketFailureReporter.forget(key);
    }

    /**
     * Applies a partial state patch and notifies listeners only when something changed.
     */
    private setState(patch: Partial<SocketState>): void {
        const next = { ...this.state, ...patch };
        if (
            next.state === this.state.state &&
            next.isConnected === this.state.isConnected &&
            next.isVerified === this.state.isVerified &&
            next.connectionId === this.state.connectionId
        ) {
            return;
        }
        this.state = next;
        for (const listener of this.stateListeners) {
            listener(next);
        }
    }

    private requireActiveClient(action: string): ClientSocketV2 {
        const client = this.getActiveClient();
        if (!client) {
            throw new Error(`[SocketManager] Socket client not ready for ${action}`);
        }
        return client;
    }

    private notifySlotClient(key: SlotKey, client: ClientSocketV2 | null): void {
        // Re-bind owned slot subscriptions FIRST: teardownEntry notifies while the old client is
        // still alive, so this is the one moment the previous subscription can be released cleanly.
        for (const entry of this.slotTypeListeners) {
            if (entry.key === key) {
                this.bindSlotTypeListener(entry, client);
            }
        }
        for (const listener of this.slotClientListeners) {
            listener(key, client);
        }
    }

    /** Re-binds every owned push subscription to the given (active) client. */
    private rebindTypeListeners(client: ClientSocketV2 | null): void {
        for (const entry of this.typeListeners) {
            entry.unsubscribe?.();
            entry.unsubscribe = undefined;
            this.bindTypeListener(entry, client);
        }
    }

    /**
     * (Re-)binds one slot-pinned subscription to the given client. A null client means the slot is
     * gone: drop the old subscription and wait — never throw, never bind elsewhere.
     */
    private bindSlotTypeListener(entry: SlotTypeListenerEntry, client: ClientSocketV2 | null): void {
        entry.unsubscribe?.();
        entry.unsubscribe = undefined;
        if (!client) return;
        entry.unsubscribe = client.onType(entry.type, entry.listener);
    }

    private bindTypeListener(entry: TypeListenerEntry, client: ClientSocketV2 | null): void {
        if (!client) {
            // Defer until an active client exists; rebindTypeListeners re-attempts on active change.
            logger.debug('SOCKET', '[SocketManager] Skipping onType bind until an active socket exists', {
                type: entry.type,
            });
            return;
        }
        entry.unsubscribe = client.onType(entry.type, entry.listener);
    }

    private isSameConfig(left: SocketBindingConfig | null, right: SocketBindingConfig): boolean {
        return !!left && left.url === right.url && left.deviceId === right.deviceId && left.wssType === right.wssType;
    }

    private createClient(config: SocketBindingConfig): ClientSocketV2 {
        // Attach the SDK AuthController: it owns the socket token SSoT, expiry-based refresh,
        // reconnect re-auth, epoch serialization, and backoff → terminal `expired`. Each slot gets
        // its OWN client (and its own timer scheduler — never shared, §6-13).
        return createClientSocketV2({
            url: this.normalizeUrl(config.url),
            device: {
                id: config.deviceId,
                platform: 'web',
            },
            auth: AUTH_OPTIONS,
        });
    }

    private normalizeUrl(url: string): string {
        try {
            const next = new URL(url);
            if (!next.searchParams.has('v2')) {
                next.searchParams.set('v2', '');
            }
            return next.toString();
        } catch {
            const separator = url.includes('?') ? '&' : '?';
            return url.includes('v2=') ? url : `${url}${separator}v2=`;
        }
    }
}
