import type {
    ClientSocketErrorEvent,
    ClientSocketMessageEvent,
    ClientSocketStateEvent,
    ClientSocketV2,
    SocketMessage,
} from '@lemoncloud/chatic-sockets-lib';

import { logger } from '@chatic/bridges';

import type { ISocketManager } from './types';

type TypeListenerEntry = {
    type: string;
    listener: (message: SocketMessage<any>) => void;
    unsubscribe?: () => void;
};

/**
 * Stable proxy that survives socket instance replacement in SocketManager.
 * Gateways and inbound dispatchers bind to this proxy instead of a raw ClientSocketV2.
 */
export class ManagedSocketClientProxy {
    private currentClient: ClientSocketV2 | null = null;
    private readonly typeListeners = new Set<TypeListenerEntry>();
    private readonly unsubscribeClient: () => void;

    constructor(private readonly manager: ISocketManager) {
        this.unsubscribeClient = this.manager.subscribeClient(client => {
            if (this.currentClient === client) return;
            this.currentClient = client;
            this.rebindTypeListeners();
        });
    }

    public get state() {
        return this.currentClient?.state ?? 'idle';
    }

    public connect(): Promise<void> {
        return this.manager.connect();
    }

    public disconnect(code?: number, reason?: string): Promise<void> {
        const client = this.requireClient('disconnect()');
        return client.disconnect(code, reason);
    }

    public send<T = unknown>(type: string | SocketMessage<T>, data?: T): void {
        const client = this.requireClient('send()');
        if (typeof type === 'string') {
            client.send(type as any, data as any);
            return;
        }
        client.send(type);
    }

    public request<T = unknown>(type: string, data?: unknown, options?: { timeoutMs?: number }): Promise<T> {
        const client = this.requireClient(`request(${type})`);
        return client.request(type as any, data as any, options) as Promise<T>;
    }

    public onState(listener: (event: ClientSocketStateEvent) => void): () => void {
        const client = this.requireClient('onState()');
        return client.onState(listener);
    }

    public onError(listener: (event: ClientSocketErrorEvent) => void): () => void {
        const client = this.requireClient('onError()');
        return client.onError(listener);
    }

    public onMessage(listener: (event: ClientSocketMessageEvent) => void): () => void {
        const client = this.requireClient('onMessage()');
        return client.onMessage(listener);
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
        this.unsubscribeClient();
        for (const entry of this.typeListeners) {
            entry.unsubscribe?.();
        }
        this.typeListeners.clear();
        this.currentClient = null;
    }

    private requireClient(action: string): ClientSocketV2 {
        const client = this.currentClient ?? this.manager.getClient();
        if (!client) {
            throw new Error(`[ManagedSocketClientProxy] Socket client not ready for ${action}`);
        }
        return client;
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
            logger.debug('SOCKET', '[ManagedSocketClientProxy] Skipping bind until socket client is ready', {
                type: entry.type,
            });
            return;
        }
        entry.unsubscribe = this.currentClient.onType(entry.type, entry.listener);
    }
}
