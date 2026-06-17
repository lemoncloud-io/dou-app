import { type ClientSocketV2, createClientSocketV2 } from '@lemoncloud/chatic-sockets-lib';

import type { ManagedSocketRecord, SocketBindingConfig, SocketCloudId } from './types';
import { logger } from '@chatic/bridges';

/** Callback signature for listening to changes of the active client. */
type ActiveClientListener = (client: ClientSocketV2 | null, cloudId: SocketCloudId) => void;

/**
 * SocketManager is responsible for managing multiple ClientSocketV2 instances,
 * mapped by SocketCloudId. It handles creating, caching, updating, and destroying
 * socket connections, and maintains a concept of the "active" client connection.
 */
export class SocketManager {
    // Map of cloudId to its respective client socket and configuration.
    private readonly records = new Map<SocketCloudId, ManagedSocketRecord>();
    // Listeners subscribed to changes of the active client socket.
    private readonly activeClientListeners = new Set<ActiveClientListener>();
    // The currently active cloud context.
    private activeCloudId: SocketCloudId = 'default';

    /**
     * Ensures a ClientSocketV2 instance exists for the given cloudId with the provided config.
     * If a client already exists with the exact same config, it is reused.
     * If the config has changed, the old client is destroyed and a new one is created.
     */
    public ensure(cloudId: SocketCloudId, config: SocketBindingConfig): ClientSocketV2 {
        const existing = this.records.get(cloudId);
        if (existing && this.isSameConfig(existing.config, config)) {
            return existing.client;
        }

        if (existing) {
            this.destroyClient(cloudId, existing);
        }

        const client = createClientSocketV2({
            url: this.normalizeUrl(config.url),
            device: {
                id: config.deviceId,
                platform: 'web',
            },
        });

        const unsubscribeError = client.onError(event => {
            logger.error('SOCKET', `[SocketManager] Socket error (cloudId=${cloudId})`, {
                error: event.error,
                data: { cloudId, phase: event.phase },
            });
        });

        this.records.set(cloudId, { client, config, unsubscribeError });

        // If the updated/created client is the active one, notify listeners.
        if (this.activeCloudId === cloudId) {
            this.emitActiveClientChanged();
        }

        return client;
    }

    /**
     * Retrieves the socket client associated with the given cloudId.
     */
    public get(cloudId: SocketCloudId): ClientSocketV2 | null {
        return this.records.get(cloudId)?.client ?? null;
    }

    /**
     * Gets the currently active cloud ID.
     */
    public getActiveCloudId(): SocketCloudId {
        return this.activeCloudId;
    }

    /**
     * Sets the active cloud ID and notifies listeners if it changed.
     */
    public setActiveCloudId(cloudId: SocketCloudId): void {
        if (this.activeCloudId === cloudId) return;
        this.activeCloudId = cloudId;
        this.emitActiveClientChanged();
    }

    /**
     * Retrieves the ClientSocketV2 instance of the currently active cloud.
     */
    public getActiveClient(): ClientSocketV2 | null {
        return this.get(this.activeCloudId);
    }

    /**
     * Retrieves the configuration of the currently active cloud connection.
     */
    public getActiveConfig(): SocketBindingConfig | null {
        return this.records.get(this.activeCloudId)?.config ?? null;
    }

    /**
     * Destroys and removes the client associated with the given cloudId.
     */
    public remove(cloudId: SocketCloudId): void {
        const record = this.records.get(cloudId);
        if (!record) return;

        this.destroyClient(cloudId, record);
        this.records.delete(cloudId);

        if (this.activeCloudId === cloudId) {
            this.emitActiveClientChanged();
        }
    }

    /**
     * Destroys all managed socket clients and clears records.
     */
    public destroy(): void {
        for (const [cloudId, record] of this.records) {
            this.destroyClient(cloudId, record);
        }
        this.records.clear();
        this.emitActiveClientChanged();
    }

    /**
     * Subscribes a listener to active client changes.
     * Triggers immediately with the current active client upon registration.
     */
    public subscribeActiveClient(listener: ActiveClientListener): () => void {
        this.activeClientListeners.add(listener);
        listener(this.getActiveClient(), this.activeCloudId);

        return () => {
            this.activeClientListeners.delete(listener);
        };
    }

    /**
     * Subscribes a listener to the state of the active client (e.g. 'connected', 'connecting', 'disconnected').
     * Handles switching states correctly when the active client itself changes.
     */
    public subscribeActiveClientState(listener: (state: ClientSocketV2['state']) => void): () => void {
        let unsubscribeState: (() => void) | null = null;

        // Binds connection state listener to the current client instance.
        const bind = (client: ClientSocketV2 | null) => {
            unsubscribeState?.();
            unsubscribeState = null;

            listener(client?.state ?? 'idle');

            if (!client) return;
            unsubscribeState = client.onState(event => {
                listener(event.next);
            });
        };

        // Subscribe to active client switches and re-bind state listener to the new client.
        const unsubscribeClient = this.subscribeActiveClient(client => {
            bind(client);
        });

        return () => {
            unsubscribeState?.();
            unsubscribeClient();
        };
    }

    /**
     * Fires the active client changed event to all active client listeners.
     */
    private emitActiveClientChanged(): void {
        const client = this.getActiveClient();
        for (const listener of this.activeClientListeners) {
            listener(client, this.activeCloudId);
        }
    }

    /**
     * Safely destroys the socket client instance, catching and logging any errors.
     */
    private destroyClient(cloudId: SocketCloudId, record: ManagedSocketRecord): void {
        try {
            record.unsubscribeError?.();
        } catch (error) {
            logger.warn('SOCKET', '[SocketManager] Failed to unsubscribe error listener', {
                data: { cloudId },
                error,
            });
        }

        try {
            record.client.destroy();
        } catch (error) {
            logger.warn('SOCKET', '[SocketManager] Failed to destroy socket client', {
                data: { cloudId },
                error,
            });
        }
    }

    /**
     * Compares two SocketBindingConfig instances to see if they are identical.
     */
    isSameConfig = (left: SocketBindingConfig, right: SocketBindingConfig): boolean =>
        left.url === right.url && left.deviceId === right.deviceId && left.wssType === right.wssType;

    /**
     * Normalizes the URL by appending the 'v2=' query parameter.
     * Ensures the connection requests the V2 protocol.
     */
    normalizeUrl = (url: string): string => `${url}${url.includes('?') ? '&' : '?'}v2=`;
}
