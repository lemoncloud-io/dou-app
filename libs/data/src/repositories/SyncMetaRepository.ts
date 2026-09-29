import type { ISyncMetaLocalDataSource, LocalDataSourceContextOverride } from '../local/data-sources';
import type { DataContextProvider } from './types';
import { BaseRepository, type DisposableRepository } from './types';

export interface ISyncMetaRepository extends DisposableRepository {
    getSyncedAt(kind: string): Promise<number>;
    setSyncedAt(kind: string, syncedAt: number): Promise<void>;
}

/**
 * Local-only repository for sync cursors (e.g. the `channel.sync` `since`). Has no remote
 * data source — it just persists/reads the cid/uid-scoped meta cache.
 *
 * It names its graph's cloud and uid on every call. The local data sources are shared by every
 * repository graph and fall back to the SELECTED scope, so a graph built for another cloud that
 * left the scope to them would read and write its cursor in whichever cloud is on screen.
 */
export class SyncMetaRepository extends BaseRepository implements ISyncMetaRepository {
    constructor(
        private readonly syncMetaLocalDataSource: ISyncMetaLocalDataSource,
        contextProvider: DataContextProvider
    ) {
        super(contextProvider);
    }

    public getSyncedAt(kind: string): Promise<number> {
        return this.syncMetaLocalDataSource.getSyncedAt(kind, this.getScope());
    }

    public setSyncedAt(kind: string, syncedAt: number): Promise<void> {
        return this.syncMetaLocalDataSource.setSyncedAt(kind, syncedAt, this.getScope());
    }

    /** The partition half of the context only: a cursor is keyed by cloud and account, nothing else. */
    private getScope(): LocalDataSourceContextOverride {
        const { cid, uid } = this.getRepositoryContext();
        return { cid, uid };
    }
}
