import type { ISocketClient } from '@chatic/data';
import { logger } from '@chatic/bridges';
import type { ClientSocketV2, SocketMessage } from '@lemoncloud/chatic-sockets-lib';

import type { SocketCloudId } from './types';
import type { SocketManager } from './SocketManager';

type TypeListenerEntry = {
    type: string;
    listener: (message: SocketMessage<any>) => void;
    unsubscribe?: () => void;
};

export class SocketClientAdapter implements ISocketClient {
    private readonly typeListeners = new Set<TypeListenerEntry>();
    private currentClient: ClientSocketV2 | null = null;
    private currentCloudId: SocketCloudId = 'default';

    private readonly unsubscribeActiveClient: () => void;

    constructor(private readonly manager: SocketManager) {
        this.unsubscribeActiveClient = this.manager.subscribeActiveClient((client, cloudId) => {
            if (this.currentClient === client && this.currentCloudId === cloudId) return;
            this.currentClient = client;
            this.currentCloudId = cloudId;
            this.rebindTypeListeners();
        });
    }

    public request<T = unknown>(type: string, data?: unknown, options?: { timeoutMs?: number }): Promise<T> {
        const client = this.requireClient(`request(${type})`);
        return client.request(type as any, data as any, options) as Promise<T>;
    }

    public send<T = unknown>(message: SocketMessage<T>): void {
        const client = this.requireClient(`send(${message.type})`);
        client.send(message);
    }

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

    public destroy(): void {
        this.unsubscribeActiveClient();
        for (const entry of this.typeListeners) {
            entry.unsubscribe?.();
        }
        this.typeListeners.clear();
        this.currentClient = null;
    }

    private requireClient(action: string): ClientSocketV2 {
        if (!this.currentClient) {
            throw new Error(
                `[SocketClientAdapter] Active socket client not ready for ${action} (cloudId=${this.currentCloudId})`
            );
        }
        return this.currentClient;
    }

    private rebindTypeListeners(): void {
        for (const entry of this.typeListeners) {
            entry.unsubscribe?.();
            entry.unsubscribe = undefined;
            this.bindTypeListener(entry);
        }
    }

    private bindTypeListener(entry: TypeListenerEntry): void {
        if (!this.currentClient) {
            logger.debug('SOCKET', '[SocketClientAdapter] Skipping bind until active socket client is ready', {
                type: entry.type,
                data: { cloudId: this.currentCloudId },
            });
            return;
        }

        entry.unsubscribe = this.currentClient.onType(entry.type, entry.listener);
    }
}
