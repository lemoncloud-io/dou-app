import type { DomainInviteCloud, DomainListResult } from '../domain';
import { createDomainListResult } from '../domain';
import type { IEventBus } from '../events/eventBus';
import type { DomainEventMap } from '../events/domain';
import type { IInviteCloudLocalDataSourceV2 } from '../local/data-sources-v2';
import { BaseRepositoryV2, type DataContextProviderV2, type DisposableRepositoryV2 } from './types';

export interface IInviteCloudRepositoryV2 extends DisposableRepositoryV2 {
    observeList(callback: (result: DomainListResult<DomainInviteCloud> | null) => void): () => void;
    observeItem(id: string, callback: (item: DomainInviteCloud | null) => void): () => void;

    cacheRead(id: string): Promise<DomainInviteCloud | null>;
    cacheReadList(): Promise<DomainListResult<DomainInviteCloud> | null>;
    cacheWrite(item: Partial<DomainInviteCloud>): Promise<void>;
    cacheWriteMany(items: Array<Partial<DomainInviteCloud>>): Promise<void>;
    cacheDelete(id: string): Promise<void>;
    cacheClear(): Promise<void>;
}

/** Caches invite-cloud lookups and keeps remote refreshes scoped to the active cloud context. */
export class InviteCloudRepositoryV2 extends BaseRepositoryV2 implements IInviteCloudRepositoryV2 {
    constructor(
        private readonly inviteCloudLocalDataSource: IInviteCloudLocalDataSourceV2,
        contextProvider: DataContextProviderV2,
        domainEventBus: IEventBus<DomainEventMap>
    ) {
        super(contextProvider, domainEventBus);
    }

    public observeList(callback: (result: DomainListResult<DomainInviteCloud> | null) => void): () => void {
        return this.inviteCloudLocalDataSource.observeList(undefined, callback as any, this.getRepositoryContext());
    }

    public observeItem(id: string, callback: (item: DomainInviteCloud | null) => void): () => void {
        return this.inviteCloudLocalDataSource.observeItem(id, callback as any, this.getRepositoryContext());
    }

    public cacheRead(id: string): Promise<DomainInviteCloud | null> {
        return this.inviteCloudLocalDataSource.cacheRead(
            id,
            this.getRepositoryContext()
        ) as Promise<DomainInviteCloud | null>;
    }

    public async cacheReadList(): Promise<DomainListResult<DomainInviteCloud> | null> {
        return (
            ((await this.inviteCloudLocalDataSource.cacheReadList(
                undefined,
                this.getRepositoryContext()
            )) as DomainListResult<DomainInviteCloud> | null) ??
            createDomainListResult([], { total: 0, source: 'local' })
        );
    }

    public cacheWrite(item: Partial<DomainInviteCloud>): Promise<void> {
        return this.inviteCloudLocalDataSource.cacheWrite(item, this.getRepositoryContext());
    }

    public cacheWriteMany(items: Array<Partial<DomainInviteCloud>>): Promise<void> {
        return this.inviteCloudLocalDataSource.cacheWriteMany(items, this.getRepositoryContext());
    }

    public cacheDelete(id: string): Promise<void> {
        return this.inviteCloudLocalDataSource.cacheDelete(id, this.getRepositoryContext());
    }

    public cacheClear(): Promise<void> {
        return this.inviteCloudLocalDataSource.cacheClear(this.getRepositoryContext());
    }
}
