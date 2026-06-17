import { logger } from '@chatic/bridges';
import { createClientSocketV2, type ClientSocketV2 } from '@lemoncloud/chatic-sockets-lib';

import type { ManagedSocketRecord, SocketBindingConfig, SocketCloudId } from './types';

type ActiveClientListener = (client: ClientSocketV2 | null, cloudId: SocketCloudId) => void;

export class SocketManager {
    private readonly records = new Map<SocketCloudId, ManagedSocketRecord>();
    private readonly activeClientListeners = new Set<ActiveClientListener>();
    private activeCloudId: SocketCloudId = 'default';

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

        if (this.activeCloudId === cloudId) {
            this.emitActiveClientChanged();
        }

        return client;
    }

    public get(cloudId: SocketCloudId): ClientSocketV2 | null {
        return this.records.get(cloudId)?.client ?? null;
    }

    public getActiveCloudId(): SocketCloudId {
        return this.activeCloudId;
    }

    public setActiveCloudId(cloudId: SocketCloudId): void {
        if (this.activeCloudId === cloudId) return;
        this.activeCloudId = cloudId;
        this.emitActiveClientChanged();
    }

    public getActiveClient(): ClientSocketV2 | null {
        return this.get(this.activeCloudId);
    }

    public getActiveConfig(): SocketBindingConfig | null {
        return this.records.get(this.activeCloudId)?.config ?? null;
    }

    public remove(cloudId: SocketCloudId): void {
        const record = this.records.get(cloudId);
        if (!record) return;

        this.destroyClient(cloudId, record);
        this.records.delete(cloudId);

        if (this.activeCloudId === cloudId) {
            this.emitActiveClientChanged();
        }
    }

    public destroy(): void {
        for (const [cloudId, record] of this.records) {
            this.destroyClient(cloudId, record);
        }
        this.records.clear();
        this.emitActiveClientChanged();
    }

    public subscribeActiveClient(listener: ActiveClientListener): () => void {
        this.activeClientListeners.add(listener);
        listener(this.getActiveClient(), this.activeCloudId);

        return () => {
            this.activeClientListeners.delete(listener);
        };
    }

    public subscribeActiveClientState(listener: (state: ClientSocketV2['state']) => void): () => void {
        let unsubscribeState: (() => void) | null = null;

        const bind = (client: ClientSocketV2 | null) => {
            unsubscribeState?.();
            unsubscribeState = null;
            listener(client?.state ?? 'idle');

            if (!client) return;
            unsubscribeState = client.onState(event => {
                listener(event.next);
            });
        };

        const unsubscribeClient = this.subscribeActiveClient(client => {
            bind(client);
        });

        return () => {
            unsubscribeState?.();
            unsubscribeClient();
        };
    }

    private emitActiveClientChanged(): void {
        const client = this.getActiveClient();
        for (const listener of this.activeClientListeners) {
            listener(client, this.activeCloudId);
        }
    }

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

    private isSameConfig(left: SocketBindingConfig, right: SocketBindingConfig): boolean {
        return left.url === right.url && left.deviceId === right.deviceId && left.wssType === right.wssType;
    }

    private normalizeUrl(url: string): string {
        return `${url}${url.includes('?') ? '&' : '?'}v2=`;
    }
}
