import type { UserMySiteInput } from '@lemoncloud/chatic-sockets-api';
import type { DomainListResult, DomainPlace } from '../domain';
import { toDomainPlace } from '../domain';
import type { IPlaceLocalDataSourceV2 } from '../local/data-sources-v2';
import type {
    IPlaceRemoteDataSource,
    PlaceCreateInput,
    PlaceDeleteInput,
    PlaceGetInput,
    PlaceUpdateInput,
} from '../remote/data-sources';
import {
    BaseRepositoryV2,
    type DataContextProviderV2,
    type DisposableRepositoryV2,
    type RepositoryRefreshResult,
} from './types';

export interface IPlaceRepositoryV2 extends DisposableRepositoryV2 {
    observeList(
        query: UserMySiteInput | undefined,
        callback: (result: DomainListResult<DomainPlace> | null) => void
    ): () => void;
    observeItem(id: string, callback: (item: DomainPlace | null) => void): () => void;

    refreshList(query?: UserMySiteInput): Promise<RepositoryRefreshResult>;
    createPlace(payload: PlaceCreateInput): Promise<DomainPlace>;
    getPlace(payload: PlaceGetInput): Promise<DomainPlace>;
    updatePlace(payload: PlaceUpdateInput): Promise<DomainPlace>;
    deletePlace(payload: PlaceDeleteInput): Promise<DomainPlace>;

    cacheRead(id: string): Promise<DomainPlace | null>;
    cacheReadList(query?: UserMySiteInput): Promise<DomainListResult<DomainPlace> | null>;
    cacheWrite(item: Partial<DomainPlace>): Promise<void>;
    cacheWriteMany(items: Array<Partial<DomainPlace>>): Promise<void>;
    cacheDelete(id: string): Promise<void>;
    cacheClear(): Promise<void>;
}

/** Keeps place cache in sync and rolls back optimistic mutations when remote writes fail. */
export class PlaceRepositoryV2 extends BaseRepositoryV2 implements IPlaceRepositoryV2 {
    constructor(
        private readonly placeRemoteDataSource: IPlaceRemoteDataSource,
        private readonly placeLocalDataSource: IPlaceLocalDataSourceV2,
        contextProvider: DataContextProviderV2
    ) {
        super(contextProvider);
    }

    public observeList(
        query: UserMySiteInput | undefined,
        callback: (result: DomainListResult<DomainPlace> | null) => void
    ): () => void {
        return this.placeLocalDataSource.observeList(query, callback, this.getRepositoryContext());
    }

    public observeItem(id: string, callback: (item: DomainPlace | null) => void): () => void {
        return this.placeLocalDataSource.observeItem(id, callback, this.getRepositoryContext());
    }

    public cacheRead(id: string): Promise<DomainPlace | null> {
        return this.placeLocalDataSource.cacheRead(id, this.getRepositoryContext());
    }

    public cacheReadList(query?: UserMySiteInput): Promise<DomainListResult<DomainPlace> | null> {
        return this.placeLocalDataSource.cacheReadList(query, this.getRepositoryContext());
    }

    public cacheWrite(item: Partial<DomainPlace>): Promise<void> {
        return this.placeLocalDataSource.cacheWrite(item, this.getRepositoryContext());
    }

    public cacheWriteMany(items: Array<Partial<DomainPlace>>): Promise<void> {
        return this.placeLocalDataSource.cacheWriteMany(items, this.getRepositoryContext());
    }

    public cacheDelete(id: string): Promise<void> {
        return this.placeLocalDataSource.cacheDelete(id, this.getRepositoryContext());
    }

    public cacheClear(): Promise<void> {
        return this.placeLocalDataSource.cacheClear(this.getRepositoryContext());
    }

    public async refreshList(query?: UserMySiteInput): Promise<RepositoryRefreshResult> {
        const requestScope = this.getDomainScope();
        const requestContext = this.getRepositoryContext();
        const remote = await this.placeRemoteDataSource.fetchPlace(query);
        const domainList = (remote.list || []).map((item, index) => ({
            ...toDomainPlace(item as Partial<DomainPlace>, requestScope),
            cid: requestScope.cid,
            order: index,
        }));
        if (!this.isSameContext(requestContext)) {
            return { wroteCount: 0 };
        }
        await this.placeLocalDataSource.cacheWriteMany(domainList, requestContext);
        return { wroteCount: domainList.length };
    }

    public async createPlace(payload: PlaceCreateInput): Promise<DomainPlace> {
        const remote = await this.placeRemoteDataSource.createPlace(payload);
        const domain = toDomainPlace(remote as Partial<DomainPlace>, this.getDomainScope());
        await this.placeLocalDataSource.cacheWrite(domain, this.getRepositoryContext());
        return domain;
    }

    public async getPlace(payload: PlaceGetInput): Promise<DomainPlace> {
        const remote = await this.placeRemoteDataSource.getPlace(payload);
        const domain = toDomainPlace(remote as Partial<DomainPlace>, this.getDomainScope());
        await this.placeLocalDataSource.cacheWrite(domain, this.getRepositoryContext());
        return domain;
    }

    public async updatePlace(payload: PlaceUpdateInput): Promise<DomainPlace> {
        const id = (payload as { id?: string }).id;
        const context = this.getRepositoryContext();
        const existing = id ? await this.placeLocalDataSource.cacheRead(id, context) : null;
        if (id) {
            await this.placeLocalDataSource.cacheWrite({ id, ...(payload as Partial<DomainPlace>) }, context);
        }
        try {
            const remote = await this.placeRemoteDataSource.updatePlace(payload);
            const domain = toDomainPlace(remote as Partial<DomainPlace>, this.getDomainScope());
            await this.placeLocalDataSource.cacheWrite(domain, context);
            return domain;
        } catch (error) {
            if (existing) {
                await this.placeLocalDataSource.cacheWrite(existing, context);
            }
            throw error;
        }
    }

    public async deletePlace(payload: PlaceDeleteInput): Promise<DomainPlace> {
        const id = (payload as { id?: string }).id || '';
        const context = this.getRepositoryContext();
        const existing = id ? await this.placeLocalDataSource.cacheRead(id, context) : null;
        if (id) {
            await this.placeLocalDataSource.cacheDelete(id, context);
        }
        try {
            const remote = await this.placeRemoteDataSource.deletePlace(payload);
            return toDomainPlace(remote as Partial<DomainPlace>, this.getDomainScope());
        } catch (error) {
            if (existing) {
                await this.placeLocalDataSource.cacheWrite(existing, context);
            }
            throw error;
        }
    }
}
