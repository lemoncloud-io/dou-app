import type { CacheMetaView } from '@chatic/bridge-messages';
import type { DataContextProvider } from '../../repositories/types';
import type { LocalDataSourceContextOverride } from './types';
import { logger, type ObservationData } from '@chatic/logger';
import type { ScopedCacheStorage } from '../ports';
import { resolveTtlMs } from '../ports/policy';
import { BaseLocalDataSource } from './types';

export interface ISyncMetaLocalDataSource {
    getSyncedAt(kind: string, contextOverride?: LocalDataSourceContextOverride): Promise<number>;
    setSyncedAt(kind: string, syncedAt: number, contextOverride?: LocalDataSourceContextOverride): Promise<void>;
    cacheClear(contextOverride?: LocalDataSourceContextOverride): Promise<void>;
}

export class SyncMetaLocalDataSource extends BaseLocalDataSource<'meta'> implements ISyncMetaLocalDataSource {
    constructor(
        contextProvider: DataContextProvider,
        storages: ScopedCacheStorage<'meta'>,
        private readonly routingFingerprint?: string,
        private readonly cursorsValidAfter?: () => number
    ) {
        super(contextProvider, storages);
    }

    public async getSyncedAt(kind: string, contextOverride?: LocalDataSourceContextOverride): Promise<number> {
        const row = await this.storage(contextOverride).load(kind);
        if (!row) return 0;
        if (this.routingFingerprint && row.routing !== this.routingFingerprint) {
            this.reportRetired(kind, 'routing-changed');
            return 0;
        }
        const savedAt = row.__cacheMeta?.lastSyncedAt;
        if (!savedAt || savedAt + resolveTtlMs('meta') <= Date.now()) {
            this.reportRetired(kind, 'expired');
            return 0;
        }
        if (this.cursorsValidAfter && savedAt < this.cursorsValidAfter()) {
            this.reportRetired(kind, 'cache-cleared');
            return 0;
        }
        return row.syncedAt ?? 0;
    }

    private reportRetired(cursorKind: string, reason: 'routing-changed' | 'expired' | 'cache-cleared'): void {
        logger.warn('SYNC', `sync cursor retired (${reason}) — full re-sync follows`, {
            observation: 'sync-cursor-retired',
            cursorKind,
            reason,
        } satisfies ObservationData);
    }

    public async setSyncedAt(
        kind: string,
        syncedAt: number,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<void> {
        const context = this.resolveContext(contextOverride);
        const view: CacheMetaView = {
            id: kind,
            cid: this.getCid(context),
            uid: this.getUid(context),
            syncedAt,
            ...(this.routingFingerprint ? { routing: this.routingFingerprint } : {}),
        };
        await this.storage(context).save(kind, view);
    }

    public async cacheClear(contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        await this.storage(contextOverride).clearAll();
    }
}
