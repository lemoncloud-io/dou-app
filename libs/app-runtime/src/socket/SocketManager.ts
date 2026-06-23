import {
    type ClientSocketErrorEvent,
    type ClientSocketStateEvent,
    type ClientSocketV2,
    createClientSocketV2,
} from '@lemoncloud/chatic-sockets-lib';

import { logger } from '@chatic/bridges';
import type {
    ISocketManager,
    SocketBindingConfig,
    SocketClientListener,
    SocketState,
    SocketStateListener,
} from './types';

const initialState = (): SocketState => ({
    state: 'idle',
    isConnected: false,
    isVerified: false,
    isDeviceRegistered: false,
    connectionId: null,
});

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
    // Client-instance changes have exactly one consumer (the SocketClientAdapter
    // singleton), so a single slot is enough — no Set needed.
    private clientListener: SocketClientListener | null = null;
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
            isDeviceRegistered: false,
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
     * Subscribes to socket instance replacement (e.g. on scope switch / restart).
     * Fires immediately with the current client. Used by the adapter to re-bind listeners.
     */
    public subscribeClient(listener: SocketClientListener): () => void {
        this.clientListener = listener;
        listener(this.client);
        return () => {
            if (this.clientListener === listener) {
                this.clientListener = null;
            }
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
     * Marks the device as registered. Called by the session controller once
     * `device.save` resolves; the connection id is taken from its response.
     */
    public markDeviceRegistered(connectionId?: string): void {
        this.setState({
            isDeviceRegistered: true,
            ...(connectionId ? { connectionId } : {}),
        });
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
                    patch.isDeviceRegistered = false;
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

        // Handshake flags (isVerified / isDeviceRegistered) are NOT bound here:
        // `device.save` / `auth.update` are request/response calls, and the lib
        // settles their `:ok` responses by mid without routing to `onType`. The
        // session controller reports success via markVerified/markDeviceRegistered.
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
            next.isDeviceRegistered === this.state.isDeviceRegistered &&
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
     * Notifies listeners that the underlying client instance was replaced.
     */
    private emitClientChanged(): void {
        this.clientListener?.(this.client);
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
