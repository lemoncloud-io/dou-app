import type { UserMySiteInput } from '@lemoncloud/chatic-sockets-api';
import type { DomainListResult, DomainPlace } from '../domain';
import type { IPlaceLocalDataSourceV2, LocalDataSourceV2ContextOverride } from '../local/data-sources-v2';
import type {
    IPlaceRemoteDataSource,
    PlaceCreateInput,
    PlaceDeleteInput,
    PlaceGetInput,
    PlaceUpdateInput,
} from '../remote/data-sources';
import type { DataContextProvider } from './types';
import { BaseRepositoryV2, type DisposableRepositoryV2 } from './types';

export interface IPlaceRepositoryV2 extends DisposableRepositoryV2 {
    observeList(
        query: UserMySiteInput | undefined,
        callback: (result: DomainListResult<DomainPlace> | null) => void,
        contextOverride?: LocalDataSourceV2ContextOverride
    ): () => void;
    observeItem(id: string, callback: (item: DomainPlace | null) => void): () => void;

    refreshList(query?: UserMySiteInput): Promise<void>;
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
        contextProvider: DataContextProvider
    ) {
        super(contextProvider);
    }

    public observeList(
        query: UserMySiteInput | undefined,
        callback: (result: DomainListResult<DomainPlace> | null) => void,
        contextOverride?: LocalDataSourceV2ContextOverride
    ): () => void {
        // A caller-supplied override pins the observer scope to a known {cid, uid} (see useHomePlaces);
        // otherwise fall back to the live repository context.
        return this.placeLocalDataSource.observeList(query, callback, contextOverride ?? this.getRepositoryContext());
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

    public async refreshList(query?: UserMySiteInput): Promise<void> {
        const requestContext = this.getRequestContext();
        const normalizedContext = this.getNormalizedContext(requestContext);
        const remote = await this.placeRemoteDataSource.fetchPlace(query, normalizedContext);
        // Preserve the server-provided ordering by stamping the list index as `order`.
        const domainList = (remote.list || []).map((item, index) => ({ ...item, order: index }));
        await this.placeLocalDataSource.cacheWriteMany(domainList, requestContext);
    }

    public async createPlace(payload: PlaceCreateInput): Promise<DomainPlace> {
        const requestContext = this.getRequestContext();
        const normalizedContext = this.getNormalizedContext(requestContext);
        const domain = await this.placeRemoteDataSource.createPlace(payload, normalizedContext);
        await this.placeLocalDataSource.cacheWrite(domain, requestContext);
        return domain;
    }

    public async getPlace(payload: PlaceGetInput): Promise<DomainPlace> {
        const requestContext = this.getRequestContext();
        const normalizedContext = this.getNormalizedContext(requestContext);
        const domain = await this.placeRemoteDataSource.getPlace(payload, normalizedContext);
        await this.placeLocalDataSource.cacheWrite(domain, requestContext);
        return domain;
    }

    public async updatePlace(payload: PlaceUpdateInput): Promise<DomainPlace> {
        const id = (payload as { id?: string }).id;
        const requestContext = this.getRequestContext();
        const normalizedContext = this.getNormalizedContext(requestContext);
        const existing = id ? await this.placeLocalDataSource.cacheRead(id, requestContext) : null;
        if (id) {
            await this.placeLocalDataSource.cacheWrite({ id, ...(payload as Partial<DomainPlace>) }, requestContext);
        }
        try {
            const domain = await this.placeRemoteDataSource.updatePlace(payload, normalizedContext);
            await this.placeLocalDataSource.cacheWrite(domain, requestContext);
            return domain;
        } catch (error) {
            if (existing) {
                await this.placeLocalDataSource.cacheWrite(existing, requestContext);
            }
            throw error;
        }
    }

    public async deletePlace(payload: PlaceDeleteInput): Promise<DomainPlace> {
        const id = (payload as { id?: string }).id || '';
        const requestContext = this.getRequestContext();
        const normalizedContext = this.getNormalizedContext(requestContext);
        const existing = id ? await this.placeLocalDataSource.cacheRead(id, requestContext) : null;
        if (id) {
            await this.placeLocalDataSource.cacheDelete(id, requestContext);
        }
        try {
            return await this.placeRemoteDataSource.deletePlace(payload, normalizedContext);
        } catch (error) {
            if (existing) {
                await this.placeLocalDataSource.cacheWrite(existing, requestContext);
            }
            throw error;
        }
    }
}
