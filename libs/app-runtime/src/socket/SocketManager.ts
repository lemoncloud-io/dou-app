import {
    type ClientSocketErrorEvent,
    type ClientSocketStateEvent,
    type ClientSocketV2,
    createClientSocketV2,
    type SocketMessage,
} from '@lemoncloud/chatic-sockets-lib';

import { logger } from '@chatic/bridges';
import type {
    ISocketManager,
    SocketBindingConfig,
    SocketClientListener,
    SocketScope,
    SocketState,
    SocketStateListener,
} from './types';

const initialState = (): SocketState => ({
    cloudId: null,
    siteId: null,
    userId: null,
    state: 'idle',
    isConnected: false,
    isVerified: false,
    isDeviceRegistered: false,
    connectionId: null,
});

/**
 * SocketManager wraps a single ClientSocketV2 instance and owns the comprehensive,
 * observable socket state (connection + handshake). The socket is always 1:1 with
 * the current scope (cid/sid/uid): any scope or config change tears down the old
 * socket and builds a fresh one — there is no "active" socket among many.
 */
export class SocketManager implements ISocketManager {
    private client: ClientSocketV2 | null = null;
    private config: SocketBindingConfig | null = null;
    private scope: SocketScope = { cid: null, sid: null, uid: null };
    private state: SocketState = initialState();

    // State is an observable store: each consumer (e.g. a useSyncExternalStore hook,
    // one callback per mounted component) registers its own listener — hence a Set.
    private readonly stateListeners = new Set<SocketStateListener>();
    // Client-instance changes have exactly one consumer (the SocketClientAdapter
    // singleton), so a single slot is enough — no Set needed.
    private clientListener: SocketClientListener | null = null;
    private unsubscribes: Array<() => void> = [];

    /**
     * Ensures a single ClientSocketV2 bound to the given config + scope.
     * Reuses the existing socket when both config and scope are unchanged; otherwise
     * destroys the old socket and creates a fresh one for the new scope.
     */
    public ensure(config: SocketBindingConfig, scope: SocketScope): ClientSocketV2 {
        if (this.client && this.isSameConfig(this.config, config) && this.isSameScope(this.scope, scope)) {
            return this.client;
        }

        this.teardownClient();

        this.config = config;
        this.scope = scope;

        const client = this.createClient(config);
        this.client = client;
        this.bindClient(client);

        // Reset handshake flags for the new scope; connection state follows the client.
        this.setState({
            cloudId: scope.cid,
            siteId: scope.sid,
            userId: scope.uid,
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
        this.scope = { cid: null, sid: null, uid: null };
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
                    data: { phase: event.phase, ...this.scope },
                });
            })
        );

        // device.save / device.read acknowledgement → device registered (+ connection id).
        const onDevice = (message: SocketMessage<any>) => {
            const view = (message.data ?? {}) as { connId?: string };
            this.setState({
                isDeviceRegistered: true,
                ...(view.connId ? { connectionId: view.connId } : {}),
            });
        };
        this.unsubscribes.push(client.onType('device.save:ok', onDevice));
        this.unsubscribes.push(client.onType('device.read:ok', onDevice));

        // auth.update acknowledgement → verified flag.
        this.unsubscribes.push(client.onType('auth.update:ok', () => this.setState({ isVerified: true })));
        this.unsubscribes.push(client.onType('auth.update:error', () => this.setState({ isVerified: false })));
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
            next.connectionId === this.state.connectionId &&
            next.cloudId === this.state.cloudId &&
            next.siteId === this.state.siteId &&
            next.userId === this.state.userId
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

    private isSameScope(left: SocketScope, right: SocketScope): boolean {
        return left.cid === right.cid && left.sid === right.sid && left.uid === right.uid;
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
