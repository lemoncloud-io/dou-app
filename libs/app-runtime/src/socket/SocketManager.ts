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
    SocketBindingConfig,
    SocketClientListener,
    SocketKind,
    SocketState,
    SocketStateListener,
} from './types';

/**
 * SDK AuthController tuning at adoption. SDK defaults are refreshRatio 0.8 / maxFailures 5 /
 * refreshIntervalMs 30min; we override:
 *  - maxFailures 3 — a slightly faster terminal `expired` (see usage.md §1.1).
 *  - refreshIntervalMs 5min — the FALLBACK cadence used only when the socket auth response omits
 *    `expiresIn` (dev/prod currently do — §11/§6-12). The SDK schedules refresh at `expiresIn * 0.8`
 *    when present, else this interval. The 30min default is too slow: it can let the relay AWS
 *    credential (or lemon-web-core's `expired_time` = Expiration − 5min) lapse before the socket
 *    refreshes, so signed HTTP starts 403ing while the socket still reports `authenticated`. 5min
 *    stays well under the ~1h credential lifetime (and lemon's expired_time), so the socket refresh
 *    writeback keeps credentials fresh and lemon never self-refreshes (§6-12). The real fix is the
 *    server reporting `expiresIn`, which makes this fallback moot.
 */
const AUTH_OPTIONS = { refreshRatio: 0.8, maxFailures: 3, refreshIntervalMs: 5 * 60 * 1000 } as const;

/** A push subscription that must be re-bound whenever the active client is replaced. */
type TypeListenerEntry = {
    type: string;
    listener: (message: SocketMessage<any>) => void;
    unsubscribe?: () => void;
};

/** One managed socket slot (relay or cloud). Each slot owns its own SDK client + connection state. */
interface ClientEntry {
    client: ClientSocketV2;
    config: SocketBindingConfig;
    /** Mirrors this slot's SDK AuthController authenticated flag (via setAuthenticated). */
    authenticated: boolean;
    /** Latest transport state for this slot (from its onState). */
    connState: ClientSocketState;
    /** Cloud id this slot was bound to (frozen at bind) — cache attribution. */
    boundCid: string | null;
    unsubscribes: Array<() => void>;
}

const initialState = (): SocketState => ({
    state: 'idle',
    isConnected: false,
    isVerified: false,
    connectionId: null,
});

/** Default upper bound for waitUntilVerified when a caller does not pass one. */
const DEFAULT_VERIFY_TIMEOUT_MS = 10_000;

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
    private state: SocketState = initialState();

    // State is an observable store: each consumer (e.g. a useSyncExternalStore hook) registers its
    // own listener — hence a Set.
    private readonly stateListeners = new Set<SocketStateListener>();
    // Active-client listeners (e.g. SyncManager). Fired with the ACTIVE client on every active change.
    private readonly clientListeners = new Set<SocketClientListener>();
    // Push subscriptions registered via onType. Owned here so they survive active-client changes —
    // re-bound to the active client whenever the active slot changes.
    private readonly typeListeners = new Set<TypeListenerEntry>();

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
            unsubscribes: [],
        };
        this.entries.set(kind, entry);
        this.bindEntry(kind, entry);

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

    /** Observable state snapshot of the ACTIVE slot. */
    public getSnapshot(): SocketState {
        return this.state;
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
     * Mirrors the SDK AuthController's authenticated state for `kind` (wired via onAuthState in
     * bootstrapSocketConnection). When `kind` is the active slot, `isVerified` is recomputed from
     * this AND that slot being connected.
     */
    public setAuthenticated(kind: SocketKind, value: boolean): void {
        const entry = this.entries.get(kind);
        if (!entry) return;
        entry.authenticated = value;
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
     * transport owns reconnect, so this no longer intercepts 401s or drives manual reconnect/retry.
     */
    public async request<T = unknown>(type: string, data?: unknown, options?: { timeoutMs?: number }): Promise<T> {
        const client = this.requireActiveClient(`request(${type})`);
        return (await client.request(type as any, data as any, options)) as T;
    }

    public send<T = unknown>(type: string | SocketMessage<T>, data?: T): void {
        const client = this.requireActiveClient('send()');
        if (typeof type === 'string') {
            client.send(type as any, data as any);
            return;
        }
        client.send(type);
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
        if (!entry) return initialState();
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
                // Only the active slot drives the observable state; background (relay-while-cloud)
                // transport changes are tracked on the entry but not surfaced.
                if (this.getActiveKind() === kind) {
                    this.setState(this.computeState(entry));
                }
            })
        );

        entry.unsubscribes.push(
            entry.client.onError((event: ClientSocketErrorEvent) => {
                logger.error('SOCKET', '[SocketManager] Socket error', {
                    error: event.error,
                    data: { kind, phase: event.phase },
                });
            })
        );
    }

    private teardownEntry(kind: SocketKind): void {
        const entry = this.entries.get(kind);
        if (!entry) return;

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

    /** Re-binds every owned push subscription to the given (active) client. */
    private rebindTypeListeners(client: ClientSocketV2 | null): void {
        for (const entry of this.typeListeners) {
            entry.unsubscribe?.();
            entry.unsubscribe = undefined;
            this.bindTypeListener(entry, client);
        }
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
