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
import type {
    ISocketManager,
    ScopedSocketClient,
    SocketBindingConfig,
    SocketClientListener,
    SocketKind,
    SocketSlotClientListener,
    SocketState,
    SocketStateListener,
} from './types';
import { AUTH_OPTIONS, DEFAULT_VERIFY_TIMEOUT_MS, INITIAL_SOCKET_STATE } from './constants';
import { annotateSocketError } from './utils/annotateSocketError';

/** A push subscription that must be re-bound whenever the active client is replaced. */
type TypeListenerEntry = {
    type: string;
    listener: (message: SocketMessage<any>) => void;
    unsubscribe?: () => void;
};

/** The same, pinned to ONE slot: re-bound on that slot's rebuild rather than on active change. */
type SlotTypeListenerEntry = TypeListenerEntry & { kind: SocketKind };

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
    /** Cloud id this slot was bound to (frozen at bind) — cache attribution. */
    boundCid: string | null;
    /** `connected` transitions since bind — reconnect-churn telemetry (2026-08 session audit §7 Phase 0). */
    connectCount: number;
    unsubscribes: Array<() => void>;
}

/**
 * SocketManager owns up to two ClientSocketV2 slots — `relay` (always-on) and `cloud` (active-only)
 * — keyed by kind, and exposes an ACTIVE-FACADE: the observable state, request/send/onType, and
 * subscribeClient all track the ACTIVE slot (cloud when present, else relay). Slot lifecycle
 * (ensure/connect/setAuthenticated/destroy) is per-kind. Each SDK client is fully independent
 * (multi-socket-design.md §6-14); do NOT share a timerScheduler between them (§6-13) — the factory
 * gives each its own.
 */
export class SocketManager implements ISocketManager {
    private readonly entries = new Map<SocketKind, ClientEntry>();
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
    // for ANY slot, not just the active one. Backs waitUntilKindVerified; the active-slot
    // stateListeners above cannot express "relay is up" while a cloud slot is active.
    private readonly kindVerifiedListeners = new Set<(kind: SocketKind) => void>();
    // Push subscriptions registered via onType. Owned here so they survive active-client changes —
    // re-bound to the active client whenever the active slot changes.
    private readonly typeListeners = new Set<TypeListenerEntry>();
    // Push subscriptions registered via onSlotType. Owned here for the same reason, but keyed to ONE
    // slot: re-bound from notifySlotClient (the single choke point both ensure() and teardownEntry()
    // pass through) instead of from active-slot changes.
    private readonly slotTypeListeners = new Set<SlotTypeListenerEntry>();

    /**
     * Ensures the slot for `kind` is bound to `config`. Reuses the slot when its config is unchanged;
     * otherwise tears the slot down and builds a fresh client. Returns that slot's client.
     */
    public ensure(config: SocketBindingConfig, kind: SocketKind): ClientSocketV2 {
        const existing = this.entries.get(kind);
        if (existing && this.isSameConfig(existing.config, config)) {
            return existing.client;
        }

        const prevActiveClient = this.getActiveClient();
        if (existing) {
            this.teardownEntry(kind);
        }

        const client = this.createClient(config);
        const entry: ClientEntry = {
            client,
            config,
            authenticated: false,
            connState: client.state,
            // Freeze this slot's cloud (set only on an actual rebind), so a mid-switch cid flip that
            // doesn't change the url leaves it pinned to the socket's real cloud.
            boundCid: config.cid ?? null,
            connectCount: 0,
            unsubscribes: [],
        };
        this.entries.set(kind, entry);
        this.bindEntry(kind, entry);

        // Slot notification BEFORE the active-facade sync: per-slot attachments (slot runtimes)
        // must exist by the time active-client listeners replay work onto them.
        this.notifySlotClient(kind, client);
        this.syncActive(prevActiveClient);
        return client;
    }

    /**
     * A specific slot's client when `kind` is given (null if unbound), else the ACTIVE slot's client
     * (cloud when present, else relay). Logout uses the per-kind form to notify each server's socket.
     */
    public getClient(kind?: SocketKind): ClientSocketV2 | null {
        if (kind) {
            return this.entries.get(kind)?.client ?? null;
        }
        return this.getActiveClient();
    }

    /** The cloud id the ACTIVE slot was bound to (frozen at bind), or null before the first bind. */
    public getBoundCid(): string | null {
        return this.getActiveEntry()?.boundCid ?? null;
    }

    /**
     * A stable request facade pinned to ONE slot `kind` (relay/cloud), independent of the active
     * slot. Every call re-resolves the slot's client (lazy), so it survives slot teardown/rebuild
     * via ensure() — capturing the client eagerly would leave callers on a stale socket. Used for
     * requests that must target a specific server regardless of which slot is active (e.g. a
     * relay-only write while a cloud slot is active). `send` is supported symmetrically, and `onType`
     * delegates to the manager-owned onSlotType so a pinned subscription survives slot rebuilds.
     * See socket/kind-scoped-routing.md.
     */
    public getScopedClient(kind: SocketKind): ScopedSocketClient {
        const requireSlot = (action: string): ClientSocketV2 => {
            const client = this.entries.get(kind)?.client;
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
                return (client.request(type as any, data as any, options) as Promise<T>).catch(error => {
                    throw annotateSocketError(error, kind, 'request', type);
                });
            },
            send: <T = unknown>(type: string | SocketMessage<T>, data?: T): void => {
                const client = requireSlot('send()');
                try {
                    if (typeof type === 'string') {
                        client.send(type as any, data as any);
                        return;
                    }
                    client.send(type);
                } catch (error) {
                    throw annotateSocketError(error, kind, 'send', typeof type === 'string' ? type : type.type);
                }
            },
            // No requireSlot: a subscription waits for its slot instead of throwing (see onSlotType).
            onType: <T = unknown>(type: string, listener: (message: SocketMessage<T>) => void): (() => void) =>
                this.onSlotType<T>(kind, type, listener),
        };
    }

    /**
     * Re-points a slot's bound cloud id WITHOUT rebooting the socket. A same-wss cloud switch (§8-4)
     * keeps the url unchanged, so the slot is never rebuilt through ensure() and boundCid — otherwise
     * frozen at bind — would stay on the previous cloud. Without this, getBoundCid() reports the old
     * cloud and every new-cloud frame is dropped as foreign / mis-attributed by the sync layer.
     */
    public rebindCid(kind: SocketKind, cid: string | null): void {
        const entry = this.entries.get(kind);
        if (!entry) return;
        entry.boundCid = cid;
    }

    /** Observable state snapshot of the ACTIVE slot. */
    public getSnapshot(): SocketState {
        return this.state;
    }

    /**
     * Whether a SPECIFIC slot is auth-verified (authenticated AND connected). getSnapshot() only
     * reflects the ACTIVE slot; a per-kind guard (e.g. a relay re-auth while a cloud slot is active)
     * must read the target slot, not the active one.
     */
    public isKindVerified(kind: SocketKind): boolean {
        const entry = this.entries.get(kind);
        if (!entry) return false;
        return entry.authenticated && entry.connState === 'connected';
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
     * The per-kind counterpart of waitUntilVerified: resolves once THAT slot is auth-verified, or
     * `false` after `timeoutMs`. Never rejects, so a caller gating a request can still proceed
     * best-effort and let the real server error surface.
     *
     * Required by anything pinned to a slot via getScopedClient — waitUntilVerified tracks the
     * ACTIVE slot, so gating a relay-pinned request with it would wait on cloud whenever a cloud
     * session is up and fire at relay while its handshake is still in flight.
     */
    public waitUntilKindVerified(kind: SocketKind, timeoutMs: number = DEFAULT_VERIFY_TIMEOUT_MS): Promise<boolean> {
        if (this.isKindVerified(kind)) {
            return Promise.resolve(true);
        }
        return new Promise<boolean>(resolve => {
            let settled = false;
            const finish = (verified: boolean) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                this.kindVerifiedListeners.delete(onChange);
                resolve(verified);
            };
            const timer = setTimeout(() => finish(false), timeoutMs);
            const onChange = (changed: SocketKind) => {
                if (changed === kind && this.isKindVerified(kind)) finish(true);
            };
            this.kindVerifiedListeners.add(onChange);
        });
    }

    /**
     * Continuous per-kind counterpart of waitUntilKindVerified: fires immediately with THAT slot's
     * current verified value, then again on every change to it, until unsubscribed.
     *
     * waitUntilKindVerified only resolves once — fine for a one-shot gate before a single request,
     * but useless for a reactive consumer (e.g. `useQuery({ enabled })`) that must re-fire on the
     * false→true edge every time the slot drops and reconnects, not just the first time. Backs any
     * such consumer of a getScopedClient-pinned request/send.
     */
    public subscribeKindVerified(kind: SocketKind, listener: (verified: boolean) => void): () => void {
        listener(this.isKindVerified(kind));
        const onChange = (changed: SocketKind) => {
            if (changed === kind) listener(this.isKindVerified(kind));
        };
        this.kindVerifiedListeners.add(onChange);
        return () => {
            this.kindVerifiedListeners.delete(onChange);
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
        for (const [kind, entry] of this.entries) {
            listener(kind, entry.client);
        }
        return () => {
            this.slotClientListeners.delete(listener);
        };
    }

    /**
     * Mirrors the SDK AuthController's authenticated state for `kind` (wired via onAuthState in
     * bootstrapSocketConnection). When `kind` is the active slot, `isVerified` is recomputed from
     * this AND that slot being connected.
     */
    public setAuthenticated(kind: SocketKind, value: boolean): void {
        const entry = this.entries.get(kind);
        if (!entry) return;
        entry.authenticated = value;
        this.notifyKindVerified(kind);
        if (this.getActiveKind() === kind) {
            this.setState(this.computeState(entry));
        }
    }

    /** Connects the slot for `kind` if it is idle or closed. */
    public async connect(kind: SocketKind): Promise<void> {
        const entry = this.entries.get(kind);
        if (!entry) return;
        if (entry.client.state === 'idle' || entry.client.state === 'closed') {
            await entry.client.connect();
        }
    }

    /**
     * Stable request facade (ACTIVE slot). The SDK AuthController owns re-authentication and the
     * transport owns reconnect, so this no longer intercepts 401s or drives manual reconnect/retry —
     * it only names the caller on the way out (annotateSocketError), because the SDK's failures do
     * not carry the request type.
     */
    public async request<T = unknown>(type: string, data?: unknown, options?: { timeoutMs?: number }): Promise<T> {
        const client = this.requireActiveClient(`request(${type})`);
        try {
            return (await client.request(type as any, data as any, options)) as T;
        } catch (error) {
            throw annotateSocketError(error, this.getActiveKind(), 'request', type);
        }
    }

    public send<T = unknown>(type: string | SocketMessage<T>, data?: T): void {
        const client = this.requireActiveClient('send()');
        try {
            if (typeof type === 'string') {
                client.send(type as any, data as any);
                return;
            }
            client.send(type);
        } catch (error) {
            throw annotateSocketError(error, this.getActiveKind(), 'send', typeof type === 'string' ? type : type.type);
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
     * Registers a push subscription pinned to ONE slot kind, for events a specific server delivers
     * regardless of which slot is active. The entry is owned by the manager and re-bound whenever
     * that slot is rebuilt — capturing the client here would leave the listener on a dead socket
     * after the first reconnect.
     *
     * Registering against an unbound slot is NOT an error (unlike getScopedClient's request/send):
     * the entry waits and binds when the slot appears. It never falls back to another slot.
     */
    public onSlotType<T = unknown>(
        kind: SocketKind,
        type: string,
        listener: (message: SocketMessage<T>) => void
    ): () => void {
        const entry: SlotTypeListenerEntry = {
            kind,
            type,
            listener: listener as (message: SocketMessage<any>) => void,
        };
        this.slotTypeListeners.add(entry);
        this.bindSlotTypeListener(entry, this.entries.get(kind)?.client ?? null);

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

    /** Destroys one slot (`kind`) or, when omitted, all slots, and resets state. */
    public destroy(kind?: SocketKind): void {
        const prevActiveClient = this.getActiveClient();
        if (kind) {
            this.teardownEntry(kind);
        } else {
            for (const key of [...this.entries.keys()]) {
                this.teardownEntry(key);
            }
        }
        this.syncActive(prevActiveClient);
    }

    // --- active-slot derivation -------------------------------------------------------------

    /** cloud when a cloud slot exists (it is the sync/active socket), else relay. */
    private getActiveKind(): SocketKind {
        return this.entries.has('cloud') ? 'cloud' : 'relay';
    }

    private getActiveEntry(): ClientEntry | null {
        return this.entries.get(this.getActiveKind()) ?? null;
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
    private bindEntry(kind: SocketKind, entry: ClientEntry): void {
        entry.unsubscribes.push(
            entry.client.onState((event: ClientSocketStateEvent) => {
                entry.connState = event.next;
                // Leaving `connected` invalidates the auth flag, because the server authenticates a
                // CONNECTION, not a device: the next socket starts unauthenticated until its own
                // `auth.update` lands. The SDK AuthController emits no state change on a transport
                // drop (it only clears timers), so without this the flag stays `authenticated` from
                // the dead connection and `isKindVerified` goes true the instant the transport
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
                            data: { kind, connectCount: entry.connectCount },
                        });
                    }
                }
                this.notifyKindVerified(kind);
                // Only the active slot drives the observable state; background (relay-while-cloud)
                // transport changes are tracked on the entry but not surfaced.
                if (this.getActiveKind() === kind) {
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
                const fields = { error: event.error, data: { kind, phase: event.phase } };

                if (event.phase === 'request') {
                    logger.warn('SOCKET', '[SocketManager] Socket error', fields);
                    return;
                }
                logger.error('SOCKET', '[SocketManager] Socket error', fields);
            })
        );
    }

    /** Announces that `kind`'s verification inputs moved; waiters re-read isKindVerified themselves. */
    private notifyKindVerified(kind: SocketKind): void {
        for (const listener of this.kindVerifiedListeners) {
            listener(kind);
        }
    }

    private teardownEntry(kind: SocketKind): void {
        const entry = this.entries.get(kind);
        if (!entry) return;

        // Notify while the client is still alive so listeners can detach cleanly (e.g. a slot
        // runtime stopping its controllers) before destroy() tears the transport down.
        this.notifySlotClient(kind, null);

        for (const unsubscribe of entry.unsubscribes) {
            try {
                unsubscribe();
            } catch (error) {
                logger.warn('SOCKET', '[SocketManager] Failed to unsubscribe socket listener', {
                    error,
                    data: { kind },
                });
            }
        }
        try {
            entry.client.destroy();
        } catch (error) {
            logger.warn('SOCKET', '[SocketManager] Failed to destroy socket client', { error, data: { kind } });
        }
        this.entries.delete(kind);
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

    private notifySlotClient(kind: SocketKind, client: ClientSocketV2 | null): void {
        // Re-bind owned slot subscriptions FIRST: teardownEntry notifies while the old client is
        // still alive, so this is the one moment the previous subscription can be released cleanly.
        for (const entry of this.slotTypeListeners) {
            if (entry.kind === kind) {
                this.bindSlotTypeListener(entry, client);
            }
        }
        for (const listener of this.slotClientListeners) {
            listener(kind, client);
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
