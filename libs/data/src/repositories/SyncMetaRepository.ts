import type { ISyncMetaLocalDataSource } from '../local/data-sources';
import type { DataContextProvider } from './types';
import { BaseRepository, type DisposableRepository } from './types';

export interface ISyncMetaRepository extends DisposableRepository {
    getSyncedAt(kind: string): Promise<number>;
    setSyncedAt(kind: string, syncedAt: number): Promise<void>;
}

/**
 * Local-only repository for sync cursors (e.g. the `channel.sync` `since`). Has no remote
 * data source — it just persists/reads the cid/uid-scoped meta cache.
 */
export class SyncMetaRepository extends BaseRepository implements ISyncMetaRepository {
    constructor(
        private readonly syncMetaLocalDataSource: ISyncMetaLocalDataSource,
        contextProvider: DataContextProvider
    ) {
        super(contextProvider);
    }

    public getSyncedAt(kind: string): Promise<number> {
        return this.syncMetaLocalDataSource.getSyncedAt(kind);
    }

    public setSyncedAt(kind: string, syncedAt: number): Promise<void> {
        return this.syncMetaLocalDataSource.setSyncedAt(kind, syncedAt);
    }
}
