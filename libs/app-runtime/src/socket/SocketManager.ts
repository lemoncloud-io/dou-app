import {
    type ClientSocketErrorEvent,
    type ClientSocketMessageEvent,
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
    SocketRecoveryHandler,
    SocketState,
    SocketStateListener,
} from './types';

/** A push subscription that must be re-bound whenever the underlying client is replaced. */
type TypeListenerEntry = {
    type: string;
    listener: (message: SocketMessage<any>) => void;
    unsubscribe?: () => void;
};

const initialState = (): SocketState => ({
    state: 'idle',
    isConnected: false,
    isVerified: false,
    connectionId: null,
});

/** Default upper bound for waitUntilVerified when a caller does not pass one. */
const DEFAULT_VERIFY_TIMEOUT_MS = 10_000;

/**
 * SocketManager wraps a single ClientSocketV2 instance and owns the comprehensive,
 * observable socket state (connection + handshake). The socket is always 1:1 with
 * the current config (url/deviceId/wssType): any config change tears down the old
 * socket and builds a fresh one — there is no "active" socket among many.
 */
export class SocketManager implements ISocketManager {
    private client: ClientSocketV2 | null = null;
    private config: SocketBindingConfig | null = null;
    private state: SocketState = initialState();

    // State is an observable store: each consumer (e.g. a useSyncExternalStore hook,
    // one callback per mounted component) registers its own listener — hence a Set.
    private readonly stateListeners = new Set<SocketStateListener>();
    // Client-instance changes now have multiple consumers (e.g. SyncManager). A Set
    // is required: the former single slot silently dropped all but the last subscriber.
    private readonly clientListeners = new Set<SocketClientListener>();
    // Push subscriptions registered via onType. Owned here so they survive socket
    // replacement — re-bound to the fresh client on every client change.
    private readonly typeListeners = new Set<TypeListenerEntry>();
    // Recovery policy is injected by the session layer (see SocketRecoveryHandler).
    private recoveryHandler: SocketRecoveryHandler | null = null;
    // Reconnect policy for a disconnected socket (503 SOCKET NOT CONNECTED), injected by the session layer.
    private reconnectHandler: (() => Promise<void>) | null = null;
    private unsubscribes: Array<() => void> = [];

    /**
     * Ensures a single ClientSocketV2 bound to the given config.
     * Reuses the existing socket when config is unchanged; otherwise
     * destroys the old socket and creates a fresh one.
     */
    public ensure(config: SocketBindingConfig): ClientSocketV2 {
        if (this.client && this.isSameConfig(this.config, config)) {
            return this.client;
        }

        this.teardownClient();

        this.config = config;

        const client = this.createClient(config);
        this.client = client;
        this.bindClient(client);

        // Reset handshake flags; connection state follows the client.
        this.setState({
            state: client.state,
            isConnected: client.state === 'connected',
            isVerified: false,
            connectionId: null,
        });
        this.emitClientChanged();

        return client;
    }

    /**
     * Retrieves the underlying socket client, if any.
     */
    public getClient(): ClientSocketV2 | null {
        return this.client;
    }

    /**
     * Returns the current comprehensive socket state snapshot.
     */
    public getSnapshot(): SocketState {
        return this.state;
    }

    /**
     * Subscribes to socket state changes. Fires immediately with the current snapshot.
     */
    public subscribe(listener: SocketStateListener): () => void {
        this.stateListeners.add(listener);
        listener(this.state);
        return () => {
            this.stateListeners.delete(listener);
        };
    }

    /**
     * Resolves once the current socket is auth-verified (handshake complete), or after
     * `timeoutMs` elapses. Resolves `true` when verified and `false` on timeout — it never
     * rejects, so callers gating an action can fall back to best-effort behavior. Resolves
     * synchronously when the socket is already verified.
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
            // subscribe() fires immediately with the current snapshot; the early return above
            // guarantees that first call carries isVerified === false, so it is a no-op here.
            unsubscribe = this.subscribe(state => {
                if (state.isVerified) finish(true);
            });
        });
    }

    /**
     * Subscribes to socket instance replacement (e.g. on scope switch / restart).
     * Fires immediately with the current client. Used by the adapter to re-bind listeners.
     */
    public subscribeClient(listener: SocketClientListener): () => void {
        this.clientListeners.add(listener);
        listener(this.client);
        return () => {
            this.clientListeners.delete(listener);
        };
    }

    /**
     * Marks the current socket as auth-verified. Called by the session controller
     * once `auth.update` resolves — the lib settles request responses by mid and
     * does not route them to `onType`, so the controller owns this signal.
     */
    public markVerified(): void {
        this.setState({ isVerified: true });
    }

    /**
     * Marks the current socket as requiring a fresh auth acknowledgement.
     */
    public markUnverified(): void {
        this.setState({ isVerified: false });
    }

    /**
     * Connects the current socket if it is idle or closed.
     */
    public async connect(): Promise<void> {
        const client = this.client;
        if (!client) return;
        if (client.state === 'idle' || client.state === 'closed') {
            await client.connect();
        }
    }

    /**
     * Injects the 401 recovery policy. Wired at the composition root to the session
     * controller so SocketManager triggers recovery without owning auth policy.
     */
    public setRecoveryHandler(handler: SocketRecoveryHandler | null): void {
        this.recoveryHandler = handler;
    }

    /**
     * Injects the reconnect policy for a disconnected socket. Wired at the composition root to the
     * session controller so a request that hits a dead socket triggers a reconnect + retry.
     */
    public setReconnectHandler(handler: (() => Promise<void>) | null): void {
        this.reconnectHandler = handler;
    }

    /**
     * Renderer-facing recovery trigger for a socket that went dead without a request to
     * carry it back — sleep/wake or a network drop, where no send runs the reconnect+retry
     * path and the periodic heal is up to ~60s away. Runs the same reconnect + re-auth the
     * request path uses. No-op if no reconnect handler is wired. A genuinely expired token
     * still fails re-auth here and falls through to the wedge reload; this only accelerates
     * the still-valid-token case.
     */
    public async recover(reason: string): Promise<void> {
        if (!this.reconnectHandler) return;
        logger.info('SOCKET', '[SocketManager] external recovery trigger', { reason });
        await this.reconnectHandler();
    }

    /**
     * Stable request facade. Routes to the current client; on a 401 it invokes the
     * injected recovery handler and retries once against the (possibly replaced) client.
     */
    public async request<T = unknown>(type: string, data?: unknown, options?: { timeoutMs?: number }): Promise<T> {
        const client = this.requireClient(`request(${type})`);
        try {
            return await (client.request(type as any, data as any, options) as Promise<T>);
        } catch (error: any) {
            if (this.recoveryHandler && this.is401Error(error)) {
                logger.info('SOCKET', '[SocketManager] Intercepted 401 error, triggering recovery', { type });
                const success = await this.recoveryHandler();
                if (success) {
                    const retryClient = this.requireClient(`retry request(${type})`);
                    return await (retryClient.request(type as any, data as any, options) as Promise<T>);
                }
            }
            // A request against a socket left disconnected (e.g. a bootstrap race on invite entry /
            // rapid cloud switches) throws `503 SOCKET NOT CONNECTED`. Reconnect and retry once so the
            // send isn't silently lost — instead of waiting up to a minute for the periodic heal.
            if (this.reconnectHandler && this.isDisconnectedError(error)) {
                logger.info('SOCKET', '[SocketManager] request hit a disconnected socket, reconnecting', { type });
                await this.reconnectHandler();
                if (this.state.isConnected) {
                    const retryClient = this.requireClient(`retry request(${type})`);
                    return await (retryClient.request(type as any, data as any, options) as Promise<T>);
                }
            }
            throw error;
        }
    }

    private isDisconnectedError(error: any): boolean {
        return (error?.message || '').includes('SOCKET NOT CONNECTED');
    }

    public send<T = unknown>(type: string | SocketMessage<T>, data?: T): void {
        const client = this.requireClient('send()');
        if (typeof type === 'string') {
            client.send(type as any, data as any);
            return;
        }
        client.send(type);
    }

    /**
     * Registers a push subscription that survives socket replacement. The entry is
     * owned by the manager and re-bound on every client change (see emitClientChanged).
     */
    public onType<T = unknown>(type: string, listener: (message: SocketMessage<T>) => void): () => void {
        const entry: TypeListenerEntry = {
            type,
            listener: listener as (message: SocketMessage<any>) => void,
        };
        this.typeListeners.add(entry);
        this.bindTypeListener(entry);

        return () => {
            entry.unsubscribe?.();
            this.typeListeners.delete(entry);
        };
    }

    public onMessage(listener: (event: ClientSocketMessageEvent) => void): () => void {
        return this.requireClient('onMessage()').onMessage(listener);
    }

    public onState(listener: (event: ClientSocketStateEvent) => void): () => void {
        return this.requireClient('onState()').onState(listener);
    }

    public onError(listener: (event: ClientSocketErrorEvent) => void): () => void {
        return this.requireClient('onError()').onError(listener);
    }

    public disconnect(code?: number, reason?: string): Promise<void> {
        return this.requireClient('disconnect()').disconnect(code, reason);
    }

    /**
     * Destroys the socket and resets all state.
     */
    public destroy(): void {
        this.teardownClient();
        this.config = null;
        this.setState(initialState());
        this.emitClientChanged();
    }

    /**
     * Binds connection, error, and handshake listeners to the given client and
     * routes them into the comprehensive socket state.
     */
    private bindClient(client: ClientSocketV2): void {
        this.unsubscribes.push(
            client.onState((event: ClientSocketStateEvent) => {
                const next = event.next;
                const patch: Partial<SocketState> = {
                    state: next,
                    isConnected: next === 'connected',
                };
                // A dropped/closed socket loses its handshake.
                if (next === 'idle' || next === 'closed') {
                    patch.isVerified = false;
                    patch.connectionId = null;
                }
                this.setState(patch);
            })
        );

        this.unsubscribes.push(
            client.onError((event: ClientSocketErrorEvent) => {
                logger.error('SOCKET', '[SocketManager] Socket error', {
                    error: event.error,
                    data: { phase: event.phase },
                });
            })
        );

        // The `isVerified` flag is NOT bound here: `auth.update` is a request/response
        // call, and the lib settles its `:ok` response by mid without routing to
        // `onType`. The session controller reports success via markVerified.
    }

    /**
     * Safely unsubscribes all listeners and destroys the current client.
     */
    private teardownClient(): void {
        for (const unsubscribe of this.unsubscribes) {
            try {
                unsubscribe();
            } catch (error) {
                logger.warn('SOCKET', '[SocketManager] Failed to unsubscribe socket listener', { error });
            }
        }
        this.unsubscribes = [];

        if (this.client) {
            try {
                this.client.destroy();
            } catch (error) {
                logger.warn('SOCKET', '[SocketManager] Failed to destroy socket client', { error });
            }
            this.client = null;
        }
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

    /**
     * Re-binds owned push subscriptions to the new client, then notifies external
     * client-change listeners. Type-listener rebind happens first so consumers that
     * react to the change observe an already-consistent subscription state.
     */
    private emitClientChanged(): void {
        this.rebindTypeListeners();
        for (const listener of this.clientListeners) {
            listener(this.client);
        }
    }

    private requireClient(action: string): ClientSocketV2 {
        const client = this.client;
        if (!client) {
            throw new Error(`[SocketManager] Socket client not ready for ${action}`);
        }
        return client;
    }

    /** Re-binds every owned push subscription to the current client. */
    private rebindTypeListeners(): void {
        for (const entry of this.typeListeners) {
            entry.unsubscribe?.();
            entry.unsubscribe = undefined;
            this.bindTypeListener(entry);
        }
    }

    private bindTypeListener(entry: TypeListenerEntry): void {
        if (!this.client) {
            // Defer until a client exists; rebindTypeListeners re-attempts on client change.
            logger.debug('SOCKET', '[SocketManager] Skipping onType bind until socket client is ready', {
                type: entry.type,
            });
            return;
        }
        entry.unsubscribe = this.client.onType(entry.type, entry.listener);
    }

    private is401Error(error: any): boolean {
        if (!error) return false;
        const code = error.code || error.errorCode || error.statusCode || (error.response && error.response.status);
        if (code === 401 || code === '401') return true;
        const msg = error.message || '';
        // The socket lib drops the server's errorCode on settle, leaving only strings like
        // '401 UNAUTHORIZED - auth.update(...)'. Match 401 as a standalone token so an id or
        // count containing "401" can't spoof an auth failure into a token-refresh loop.
        return /\b401\b/.test(msg) || msg.includes('UNAUTHORIZED') || msg.includes('Authentication failed');
    }

    private isSameConfig(left: SocketBindingConfig | null, right: SocketBindingConfig): boolean {
        return !!left && left.url === right.url && left.deviceId === right.deviceId && left.wssType === right.wssType;
    }

    private createClient(config: SocketBindingConfig): ClientSocketV2 {
        return createClientSocketV2({
            url: this.normalizeUrl(config.url),
            device: {
                id: config.deviceId,
                platform: 'web',
            },
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
