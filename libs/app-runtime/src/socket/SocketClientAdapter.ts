import { logger } from '@chatic/bridges';
import { cloudCore, webCore } from '@chatic/web-core';
import type { ClientSocketV2, SocketMessage } from '@lemoncloud/chatic-sockets-lib';

import type { SocketCloudId } from './types';
import type { SocketManager } from './SocketManager';
import type { ISocketClient } from '@chatic/data';

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
        return this.requestWithRetry<T>(type, data, options, { auth: 0, conn: 0 });
    }

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

            if (errorMsg.includes('401 UNAUTHORIZED') && type !== 'auth.update' && retries.auth < 1) {
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

            if (errorMsg.includes('503 SOCKET NOT CONNECTED') && retries.conn < 1) {
                const connected = await this.waitForConnection(10_000);
                if (connected) {
                    return await this.requestWithRetry<T>(type, data, options, {
                        ...retries,
                        conn: retries.conn + 1,
                    });
                }
            }

            throw error;
        }
    }

    private async refreshAuthToken(): Promise<string | null> {
        const wssType = this.manager.getActiveConfig()?.wssType;
        if (wssType === 'cloud') {
            try {
                await cloudCore.refreshToken();
            } catch (error) {
                logger.error('SOCKET', '[SocketClientAdapter] cloudCore.refreshToken failed', { error });
            }
            return (
                cloudCore.getIdentityToken() ?? (await webCore.getTokenSignature()).originToken?.identityToken ?? null
            );
        }

        return (await webCore.getTokenSignature()).originToken?.identityToken ?? null;
    }

    private waitForConnection(timeoutMs: number): Promise<boolean> {
        return new Promise(resolve => {
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

    public send<T = unknown>(message: SocketMessage<T>): void {
        this.requireClient(`send(${message.type})`).send(message);
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
        if (!this.currentClient) return;
        entry.unsubscribe = this.currentClient.onType(entry.type, entry.listener);
    }
}
