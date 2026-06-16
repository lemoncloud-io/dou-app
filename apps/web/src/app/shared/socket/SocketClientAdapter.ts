import type { ISocketClient } from '@chatic/data';
import { logger } from '@chatic/bridges';
import type { ClientSocketV2, SocketMessage } from '@lemoncloud/chatic-sockets-lib';
import { cloudCore, webCore } from '@chatic/web-core';

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
        return this.requestWithRetry<T>(type, data, options, { auth: 0, conn: 0 });
    }

    /**
     * Recursive helper to perform socket requests with retry capabilities for:
     * 1. 401 UNAUTHORIZED (attempts token refresh and authentication update once)
     * 2. 503 SOCKET NOT CONNECTED (waits up to 10 seconds for connection to restore once)
     */
    private async requestWithRetry<T>(
        type: string,
        data: unknown,
        options?: { timeoutMs?: number },
        retries: { auth: number; conn: number } = { auth: 0, conn: 0 }
    ): Promise<T> {
        const client = this.requireClient(`request(${type})`);
        try {
            return await (client.request(type as any, data as any, options) as Promise<T>);
        } catch (error: any) {
            const errorMsg = String(error?.message || error || '');

            // 1. Handle 401 UNAUTHORIZED retry
            if (errorMsg.includes('401 UNAUTHORIZED')) {
                if (type !== 'auth.update' && retries.auth < 1) {
                    logger.info(
                        'SOCKET',
                        `[SocketClientAdapter] Request ${type} failed with 401 UNAUTHORIZED. Attempting token refresh and auth retry...`
                    );
                    try {
                        const token = await this.refreshAuthToken();
                        if (token) {
                            await this.request('auth.update', { token });
                            return await this.requestWithRetry<T>(type, data, options, {
                                ...retries,
                                auth: retries.auth + 1,
                            });
                        }
                    } catch (authError) {
                        logger.error('SOCKET', '[SocketClientAdapter] Failed to perform auth refresh/retry', {
                            error: authError,
                        });
                    }
                }
            }

            // 2. Handle 503 SOCKET NOT CONNECTED retry
            if (errorMsg.includes('503 SOCKET NOT CONNECTED')) {
                if (retries.conn < 1) {
                    logger.info(
                        'SOCKET',
                        `[SocketClientAdapter] Request ${type} failed with 503 SOCKET NOT CONNECTED. Waiting for connection...`
                    );
                    const connected = await this.waitForConnection(10000);
                    if (connected) {
                        logger.info('SOCKET', `[SocketClientAdapter] Connection restored. Retrying ${type}...`);
                        return await this.requestWithRetry<T>(type, data, options, {
                            ...retries,
                            conn: retries.conn + 1,
                        });
                    }
                }
            }

            throw error;
        }
    }

    /**
     * Refreshes the authentication token based on current connection type.
     */
    private async refreshAuthToken(): Promise<string | null> {
        const wssType = this.manager.getActiveConfig()?.wssType;
        if (wssType === 'cloud') {
            try {
                await cloudCore.refreshToken();
            } catch (e) {
                logger.error('SOCKET', '[SocketClientAdapter] cloudCore.refreshToken failed', { error: e });
            }
            return (
                cloudCore.getIdentityToken() ?? (await webCore.getTokenSignature()).originToken?.identityToken ?? null
            );
        } else {
            return (await webCore.getTokenSignature()).originToken?.identityToken ?? null;
        }
    }

    /**
     * Returns a promise that resolves to true once connection is restored, or false on timeout.
     */
    private waitForConnection(timeoutMs: number): Promise<boolean> {
        return new Promise<boolean>(resolve => {
            if (this.currentClient?.state === 'connected') {
                resolve(true);
                return;
            }

            let resolved = false;

            const cleanup = this.manager.subscribeActiveClientState(state => {
                if (state === 'connected' && !resolved) {
                    resolved = true;
                    cleanup();
                    clearTimeout(timeoutId);
                    resolve(true);
                }
            });

            const timeoutId = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    cleanup();
                    resolve(false);
                }
            }, timeoutMs);
        });
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
