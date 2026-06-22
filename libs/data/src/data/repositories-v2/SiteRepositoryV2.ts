import type { UserMakeSiteInput, UserMySiteInput, UserUpdateSiteInput } from '@lemoncloud/chatic-sockets-api';
import type { IEventBus } from '../events/eventBus';
import type { DomainEventMap } from '../events/domain';
import type { DomainListResult, DomainSite } from '../domain';
import { toDomainSite } from '../domain';
import type { ISiteLocalDataSourceV2 } from '../local/data-sources-v2';
import type { ISiteRemoteDataSource } from '../remote/data-sources';
import {
    BaseRepositoryV2,
    type DataContextProviderV2,
    type DisposableRepositoryV2,
    type RepositoryRefreshResult,
} from './types';

export interface ISiteRepositoryV2 extends DisposableRepositoryV2 {
    observeList(
        query: UserMySiteInput | undefined,
        callback: (result: DomainListResult<DomainSite> | null) => void
    ): () => void;
    observeItem(id: string, callback: (item: DomainSite | null) => void): () => void;

    refreshList(query?: UserMySiteInput): Promise<RepositoryRefreshResult>;
    createSite(payload: UserMakeSiteInput): Promise<DomainSite>;
    updateSite(payload: UserUpdateSiteInput): Promise<DomainSite>;

    cacheRead(id: string): Promise<DomainSite | null>;
    cacheReadList(query?: UserMySiteInput): Promise<DomainListResult<DomainSite> | null>;
    cacheWrite(item: Partial<DomainSite>): Promise<void>;
    cacheWriteMany(items: Array<Partial<DomainSite>>): Promise<void>;
    cacheDelete(id: string): Promise<void>;
    cacheClear(): Promise<void>;
}

/** Keeps site cache in sync and rolls back optimistic mutations when remote writes fail. */
export class SiteRepositoryV2 extends BaseRepositoryV2 implements ISiteRepositoryV2 {
    constructor(
        private readonly siteRemoteDataSource: ISiteRemoteDataSource,
        private readonly siteLocalDataSource: ISiteLocalDataSourceV2,
        contextProvider: DataContextProviderV2,
        domainEventBus: IEventBus<DomainEventMap>
    ) {
        super(contextProvider, domainEventBus);
        this.initializeInternalListeners();
    }

    public observeList(
        query: UserMySiteInput | undefined,
        callback: (result: DomainListResult<DomainSite> | null) => void
    ): () => void {
        return this.siteLocalDataSource.observeList(query, callback, this.getRepositoryContext());
    }

    public observeItem(id: string, callback: (item: DomainSite | null) => void): () => void {
        return this.siteLocalDataSource.observeItem(id, callback, this.getRepositoryContext());
    }

    public cacheRead(id: string): Promise<DomainSite | null> {
        return this.siteLocalDataSource.cacheRead(id, this.getRepositoryContext());
    }

    public cacheReadList(query?: UserMySiteInput): Promise<DomainListResult<DomainSite> | null> {
        return this.siteLocalDataSource.cacheReadList(query, this.getRepositoryContext());
    }

    public cacheWrite(item: Partial<DomainSite>): Promise<void> {
        return this.siteLocalDataSource.cacheWrite(item, this.getRepositoryContext());
    }

    public cacheWriteMany(items: Array<Partial<DomainSite>>): Promise<void> {
        return this.siteLocalDataSource.cacheWriteMany(items, this.getRepositoryContext());
    }

    public cacheDelete(id: string): Promise<void> {
        return this.siteLocalDataSource.cacheDelete(id, this.getRepositoryContext());
    }

    public cacheClear(): Promise<void> {
        return this.siteLocalDataSource.cacheClear(this.getRepositoryContext());
    }

    public async refreshList(query?: UserMySiteInput): Promise<RepositoryRefreshResult> {
        const requestScope = this.getDomainScope();
        const requestContext = this.getRepositoryContext();
        const remote = await this.siteRemoteDataSource.fetchSite(query);
        const domainList = (remote.list || []).map((item, index) => ({
            ...toDomainSite(item as Partial<DomainSite>, requestScope),
            cid: requestScope.cid,
            order: index,
        }));
        if (!this.isSameContext(requestContext)) {
            return { wroteCount: 0 };
        }
        await this.siteLocalDataSource.cacheWriteMany(domainList, requestContext);
        return { wroteCount: domainList.length };
    }

    public async createSite(payload: UserMakeSiteInput): Promise<DomainSite> {
        const remote = await this.siteRemoteDataSource.createSite(payload);
        const domain = toDomainSite(remote as Partial<DomainSite>, this.getDomainScope());
        await this.siteLocalDataSource.cacheWrite(domain, this.getRepositoryContext());
        return domain;
    }

    public async updateSite(payload: UserUpdateSiteInput): Promise<DomainSite> {
        const sid = (payload as { sid?: string; siteId?: string }).sid || (payload as { siteId?: string }).siteId;
        const context = this.getRepositoryContext();
        const existing = sid ? await this.siteLocalDataSource.cacheRead(sid, context) : null;
        if (sid) {
            await this.siteLocalDataSource.cacheWrite({ id: sid, ...(payload as Partial<DomainSite>) }, context);
        }
        try {
            const remote = await this.siteRemoteDataSource.updateSite(payload);
            const domain = toDomainSite(remote as Partial<DomainSite>, this.getDomainScope());
            await this.siteLocalDataSource.cacheWrite(domain, context);
            return domain;
        } catch (error) {
            if (existing) {
                await this.siteLocalDataSource.cacheWrite(existing, context);
            }
            throw error;
        }
    }

    private initializeInternalListeners(): void {
        this.onDomainEvent('site:create', detail => {
            const context = this.getRepositoryContextSnapshot();
            this.runInBackground(() => this.siteLocalDataSource.cacheWrite(detail.data, context), 'site:create');
        });
        this.onDomainEvent('site:update', detail => {
            const context = this.getRepositoryContextSnapshot();
            this.runInBackground(() => this.siteLocalDataSource.cacheWrite(detail.data, context), 'site:update');
        });
    }
}
