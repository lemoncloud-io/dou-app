import type { InviteCreateInput, InviteListInput } from '@lemoncloud/chatic-sockets-lib';
import type { MyInviteView } from '@lemoncloud/chatic-backend-api';
import type { DomainInvite, DomainListResult } from '../domain';
import { createDomainListResult } from '../domain';
import { toCacheInviteView } from '../local/data-sources/inviteCacheView';
import type { IInviteLocalDataSource } from '../local/data-sources';
import type { IInviteSocketDataSource, RelayInviteView } from '../remote/socket-data-sources';
import type { DataContext, DataContextProvider } from './types';
import { BaseRepository, type DisposableRepository } from './types';

export interface IInviteRepository extends DisposableRepository {
    list(filter?: InviteListInput | null): Promise<MyInviteView[]>;

    create(input: InviteCreateInput): Promise<MyInviteView>;

    get(code: string): Promise<RelayInviteView>;

    accept(code: string): Promise<MyInviteView>;

    cancel(code: string): Promise<MyInviteView>;

    reject(code: string): Promise<MyInviteView>;

    cacheReadList(): Promise<DomainListResult<DomainInvite>>;
    observeList(callback: (result: DomainListResult<DomainInvite> | null) => void): () => void;

    dismiss(id: string): Promise<void>;

    cacheWrite(item: Partial<DomainInvite>): Promise<void>;
    cacheDelete(id: string): Promise<void>;
    cacheClear(): Promise<void>;
}

export class InviteRepository extends BaseRepository implements IInviteRepository {
    constructor(
        private readonly inviteSocketDataSource: IInviteSocketDataSource,
        private readonly inviteLocalDataSource: IInviteLocalDataSource,
        contextProvider: DataContextProvider
    ) {
        super(contextProvider);
    }

    public async list(filter: InviteListInput | null = null): Promise<MyInviteView[]> {
        const requestContext = this.getRequestContext();
        const views = await this.inviteSocketDataSource.listInvites(filter);
        await this.mirrorToCache(views, requestContext);
        return views;
    }

    public async create(input: InviteCreateInput): Promise<MyInviteView> {
        const requestContext = this.getRequestContext();
        const view = await this.inviteSocketDataSource.createInvite(input);
        await this.mirrorToCache([view], requestContext);
        return view;
    }

    public async get(code: string): Promise<RelayInviteView> {
        return this.inviteSocketDataSource.getInvite(code);
    }

    public async accept(code: string): Promise<MyInviteView> {
        return this.inviteSocketDataSource.acceptInvite(code);
    }

    public async cancel(code: string): Promise<MyInviteView> {
        const requestContext = this.getRequestContext();
        const view = await this.inviteSocketDataSource.cancelInvite(code);
        await this.mirrorToCache([view], requestContext);
        return view;
    }

    public async reject(code: string): Promise<MyInviteView> {
        return this.inviteSocketDataSource.rejectInvite(code);
    }

    public async cacheReadList(): Promise<DomainListResult<DomainInvite>> {
        return (
            (await this.inviteLocalDataSource.cacheReadList(undefined, this.getRepositoryContext())) ??
            createDomainListResult([], { total: 0, source: 'local' })
        );
    }

    public observeList(callback: (result: DomainListResult<DomainInvite> | null) => void): () => void {
        return this.inviteLocalDataSource.observeList(undefined, callback, this.getRepositoryContext());
    }

    public async dismiss(id: string): Promise<void> {
        if (!this.isDefaultCloud()) return;
        await this.inviteLocalDataSource.cacheWrite({ id, dismissedAt: Date.now() }, this.getRepositoryContext());
    }

    public async cacheWrite(item: Partial<DomainInvite>): Promise<void> {
        if (!this.isDefaultCloud()) return;
        await this.inviteLocalDataSource.cacheWrite(item, this.getRepositoryContext());
    }

    public async cacheDelete(id: string): Promise<void> {
        if (!this.isDefaultCloud()) return;
        await this.inviteLocalDataSource.cacheDelete(id, this.getRepositoryContext());
    }

    public async cacheClear(): Promise<void> {
        if (!this.isDefaultCloud()) return;
        await this.inviteLocalDataSource.cacheClear(this.getRepositoryContext());
    }

    private isDefaultCloud(context: DataContext = this.getRepositoryContext()): boolean {
        return (this.getNormalizedContext(context).cid || 'default') === 'default';
    }

    private async mirrorToCache(views: MyInviteView[], requestContext: DataContext): Promise<void> {
        if (!this.isDefaultCloud(requestContext)) return;

        const context = this.getNormalizedContext(requestContext);
        const cid = context.cid || 'default';
        const uid = context.uid || 'default';
        const mapped = views.filter(view => !!view?.id).map(view => toCacheInviteView(view, { cid, uid }));
        if (mapped.length === 0) return;
        await this.inviteLocalDataSource.cacheWriteMany(mapped, context);
    }
}
