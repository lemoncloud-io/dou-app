import type { ISyncMetaLocalDataSource, LocalDataSourceContextOverride } from '@chatic/data-local';
import type { DataContextProvider } from './types';
import { BaseRepository, type DisposableRepository } from './types';

export interface ISyncMetaRepository extends DisposableRepository {
    getSyncedAt(kind: string): Promise<number>;
    setSyncedAt(kind: string, syncedAt: number): Promise<void>;
    cacheClear(): Promise<void>;
}

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

    public cacheClear(): Promise<void> {
        return this.syncMetaLocalDataSource.cacheClear(this.getScope());
    }

    private getScope(): LocalDataSourceContextOverride {
        const { cid, uid } = this.getRepositoryContext();
        return { cid, uid };
    }
}
