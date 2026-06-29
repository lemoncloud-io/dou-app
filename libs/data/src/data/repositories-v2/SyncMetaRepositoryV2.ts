import type { ISyncMetaLocalDataSourceV2 } from '../local/data-sources-v2';
import type { DataContextProvider } from './types';
import { BaseRepositoryV2, type DisposableRepositoryV2 } from './types';

export interface ISyncMetaRepositoryV2 extends DisposableRepositoryV2 {
    getSyncedAt(kind: string): Promise<number>;
    setSyncedAt(kind: string, syncedAt: number): Promise<void>;
}

/**
 * Local-only repository for sync cursors (e.g. the `channel.sync` `since`). Has no remote
 * data source — it just persists/reads the cid/uid-scoped meta cache.
 */
export class SyncMetaRepositoryV2 extends BaseRepositoryV2 implements ISyncMetaRepositoryV2 {
    constructor(
        private readonly syncMetaLocalDataSource: ISyncMetaLocalDataSourceV2,
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
