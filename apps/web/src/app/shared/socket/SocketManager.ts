import { type ClientSocketV2, createClientSocketV2 } from '@lemoncloud/chatic-sockets-lib';

import type { ManagedSocketRecord, SocketBindingConfig, SocketCloudId } from './types';
import { logger } from '@chatic/bridges';

type ActiveClientListener = (client: ClientSocketV2 | null, cloudId: SocketCloudId) => void;

const normalizeUrl = (url: string): string => `${url}${url.includes('?') ? '&' : '?'}v2=`;

const isSameConfig = (left: SocketBindingConfig, right: SocketBindingConfig): boolean =>
    left.url === right.url && left.deviceId === right.deviceId && left.wssType === right.wssType;

export class SocketManager {
    private readonly records = new Map<SocketCloudId, ManagedSocketRecord>();
    private readonly activeClientListeners = new Set<ActiveClientListener>();
    private activeCloudId: SocketCloudId = 'default';

    public ensure(cloudId: SocketCloudId, config: SocketBindingConfig): ClientSocketV2 {
        const existing = this.records.get(cloudId);
        if (existing && isSameConfig(existing.config, config)) {
            return existing.client;
        }

        if (existing) {
            this.destroyClient(cloudId, existing.client);
        }

        const client = createClientSocketV2({
            url: normalizeUrl(config.url),
            device: {
                id: config.deviceId,
                platform: 'web',
            },
        });

        this.records.set(cloudId, { client, config });

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

    public remove(cloudId: SocketCloudId): void {
        const record = this.records.get(cloudId);
        if (!record) return;

        this.destroyClient(cloudId, record.client);
        this.records.delete(cloudId);

        if (this.activeCloudId === cloudId) {
            this.emitActiveClientChanged();
        }
    }

    public destroy(): void {
        for (const [cloudId, record] of this.records) {
            this.destroyClient(cloudId, record.client);
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

    private emitActiveClientChanged(): void {
        const client = this.getActiveClient();
        for (const listener of this.activeClientListeners) {
            listener(client, this.activeCloudId);
        }
    }

    private destroyClient(cloudId: SocketCloudId, client: ClientSocketV2): void {
        try {
            client.destroy();
        } catch (error) {
            logger.warn('SOCKET', '[SocketManager] Failed to destroy socket client', {
                data: { cloudId },
                error,
            });
        }
    }
}
