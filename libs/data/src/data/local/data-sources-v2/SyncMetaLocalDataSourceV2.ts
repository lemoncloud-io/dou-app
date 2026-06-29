import type { CacheMetaView } from '@chatic/app-messages';
import type { DataContextProvider } from '../../repositories-v2/types';
import type { CacheStorage } from '../storages';
import { BaseLocalDataSourceV2 } from './types';

export interface ISyncMetaLocalDataSourceV2 {
    getSyncedAt(kind: string): Promise<number>;
    setSyncedAt(kind: string, syncedAt: number): Promise<void>;
}

/**
 * Persists sync cursors (e.g. the `channel.sync` `since` value) in the cid/uid-scoped
 * `meta` cache. `kind` is the metadata id (e.g. 'channel-sync'); absence reads as 0,
 * which callers treat as "sync everything".
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
        return row?.syncedAt ?? 0;
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
