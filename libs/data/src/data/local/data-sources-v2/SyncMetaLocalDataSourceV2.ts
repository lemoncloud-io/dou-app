import type { CacheMetaView } from '@chatic/app-messages';
import type { DataContextProvider } from '../../repositories-v2/types';
import type { CacheStorage } from '../storages';
import { resolveTtlMs } from '../storages/utils';
import { BaseLocalDataSourceV2 } from './types';

export interface ISyncMetaLocalDataSourceV2 {
    getSyncedAt(kind: string): Promise<number>;
    setSyncedAt(kind: string, syncedAt: number): Promise<void>;
}

/**
 * Persists sync cursors (e.g. the `channel.sync` `since` value) in the cid/uid-scoped
 * `meta` cache. `kind` is the metadata id (e.g. 'channel-sync'); absence reads as 0,
 * which callers treat as "sync everything".
 *
 * Cursors carry the meta TTL: a cursor idle beyond the TTL may point past the server's
 * delta-history window, so `getSyncedAt` reports an expired cursor as 0 to force a full
 * re-sync. Every successful sync re-saves the cursor, refreshing its TTL.
 */
export class SyncMetaLocalDataSourceV2 extends BaseLocalDataSourceV2 implements ISyncMetaLocalDataSourceV2 {
    constructor(
        contextProvider: DataContextProvider,
        private readonly cacheStorage: CacheStorage<'meta'>
    ) {
        super(contextProvider);
    }

    public async getSyncedAt(kind: string): Promise<number> {
        const row = await this.cacheStorage.load(kind);
        if (!row) return 0;
        // Expiry is computed at read time from lastSyncedAt (the local save time) instead of
        // the stored expiresAt: rows written under the old "never expire" policy carry a
        // far-future expiresAt, and read-time computation applies the current TTL retroactively.
        // Rows without cache meta (e.g. legacy adapters) are treated as expired — the safe
        // fallback is a one-time full re-sync.
        const savedAt = row.__cacheMeta?.lastSyncedAt;
        if (!savedAt || savedAt + resolveTtlMs('meta') <= Date.now()) return 0;
        return row.syncedAt ?? 0;
    }

    public async setSyncedAt(kind: string, syncedAt: number): Promise<void> {
        const view: CacheMetaView = {
            id: kind,
            cid: this.getCid(),
            uid: this.getUid(),
            syncedAt,
        };
        await this.cacheStorage.save(kind, view);
    }
}
