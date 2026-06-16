import type { ISocketClient } from '@chatic/data';
import { logger } from '@chatic/bridges';
import type { ClientSocketV2, SocketMessage } from '@lemoncloud/chatic-sockets-lib';

import type { SocketCloudId } from './types';
import type { SocketManager } from './SocketManager';

/**
 * Represents a registered listener for a specific message type.
 * Stores metadata needed to re-bind the listener if the underlying socket client changes.
 */
type TypeListenerEntry = {
    /** The message type/event name to listen to. */
    type: string;
    /** The callback handler triggered when a matching message arrives. */
    listener: (message: SocketMessage<any>) => void;
    /** The unsubscribe function returned by the currently active ClientSocketV2 instance. */
    unsubscribe?: () => void;
};

/**
 * SocketClientAdapter implements the shared ISocketClient interface.
 * It serves as a facade over ClientSocketV2 and delegates calls to the active client instance.
 * It automatically manages binding and re-binding of type listeners when the active cloud environment
 * or socket client switches in SocketManager, preventing any message loss or listener leaks.
 */
export class SocketClientAdapter implements ISocketClient {
    // Set of all registered type listeners that need to be maintained across client switches.
    private readonly typeListeners = new Set<TypeListenerEntry>();
    // The current active ClientSocketV2 connection instance.
    private currentClient: ClientSocketV2 | null = null;
    // The currently active cloud configuration identifier.
    private currentCloudId: SocketCloudId = 'default';

    // Cleanup handle for the SocketManager subscription.
    private readonly unsubscribeActiveClient: () => void;

    constructor(private readonly manager: SocketManager) {
        // Listen to changes of the active client from the manager.
        this.unsubscribeActiveClient = this.manager.subscribeActiveClient((client, cloudId) => {
            if (this.currentClient === client && this.currentCloudId === cloudId) return;
            this.currentClient = client;
            this.currentCloudId = cloudId;

            // Re-bind all type listeners to the newly active client.
            this.rebindTypeListeners();
        });
    }

    /**
     * Sends a request-response message over the active socket connection and returns a promise.
     */
    public request<T = unknown>(type: string, data?: unknown, options?: { timeoutMs?: number }): Promise<T> {
        const client = this.requireClient(`request(${type})`);
        return client.request(type as any, data as any, options) as Promise<T>;
    }

    /**
     * Sends a one-way message/notification over the active socket connection.
     */
    public send<T = unknown>(message: SocketMessage<T>): void {
        const client = this.requireClient(`send(${message.type})`);
        client.send(message);
    }

    /**
     * Registers a listener callback for a specific message type.
     * Returns an unsubscribe function to clean up the subscription.
     */
    public onType<T = unknown>(type: string, listener: (message: SocketMessage<T>) => void): () => void {
        const entry: TypeListenerEntry = {
            type,
            listener: listener as (message: SocketMessage<any>) => void,
        };

        // Track this listener so we can re-bind it if the active client changes.
        this.typeListeners.add(entry);
        this.bindTypeListener(entry);

        return () => {
            entry.unsubscribe?.();
            this.typeListeners.delete(entry);
        };
    }

    /**
     * Destroys the adapter, cleaning up all active client listeners and manager subscriptions.
     */
    public destroy(): void {
        this.unsubscribeActiveClient();
        for (const entry of this.typeListeners) {
            entry.unsubscribe?.();
        }
        this.typeListeners.clear();
        this.currentClient = null;
    }

    /**
     * Helper to assert and retrieve the active client, throwing an error if it's not ready.
     */
    private requireClient(action: string): ClientSocketV2 {
        if (!this.currentClient) {
            throw new Error(
                `[SocketClientAdapter] Active socket client not ready for ${action} (cloudId=${this.currentCloudId})`
            );
        }
        return this.currentClient;
    }

    /**
     * Unsubscribes all listeners from the previous client and re-binds them to the current client.
     */
    private rebindTypeListeners(): void {
        for (const entry of this.typeListeners) {
            entry.unsubscribe?.();
            entry.unsubscribe = undefined;
            this.bindTypeListener(entry);
        }
    }

    /**
     * Binds a single listener entry to the current active client instance.
     */
    private bindTypeListener(entry: TypeListenerEntry): void {
        if (!this.currentClient) {
            logger.debug('SOCKET', '[SocketClientAdapter] Skipping bind until active socket client is ready', {
                type: entry.type,
                data: { cloudId: this.currentCloudId },
            });
            return;
        }

        // Save the client-specific unsubscribe handle inside the entry.
        entry.unsubscribe = this.currentClient.onType(entry.type, entry.listener);
    }
}
