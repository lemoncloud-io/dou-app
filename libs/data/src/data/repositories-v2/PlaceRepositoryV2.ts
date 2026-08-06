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
        await this.syncListSnapshot(query);
    }

    /**
     * Pulls the server place snapshot and reconciles the local cache against it: server order is
     * stamped as `order`, and rows the server no longer returns are pruned (mirrors the
     * ChannelRepositoryV2.refreshList idiom). `protectedId` shields a just-created place whose row
     * may not have propagated into the list response yet.
     */
    private async syncListSnapshot(query?: UserMySiteInput, protectedId?: string): Promise<void> {
        const requestContext = this.getRequestContext();
        // The socket that answers `user.mysite` may still serve the OUTGOING cloud during a
        // switch (cache cid already flipped). Writing or pruning under the new cid would poison
        // the target partition, so skip when the socket's bound cloud differs from the active cid.
        const rawContext = this.getRepositoryContext();
        if (rawContext.socketCid != null && (requestContext.cid || 'default') !== rawContext.socketCid) {
            return;
        }
        const normalizedContext = this.getNormalizedContext(requestContext);
        const remote = await this.placeRemoteDataSource.fetchPlace(query, normalizedContext);
        // Preserve the server-provided ordering by stamping the list index as `order`.
        const domainList = (remote.list || [])
            .filter(item => !!item.id)
            .map((item, index) => ({ ...item, order: index }));
        // Nothing usable came back — leave the cache entirely alone. Right after a switch the
        // session may not be ready and answer empty; writing or pruning against that would wipe
        // the real rows. A genuinely empty account settles on a later response.
        if (domainList.length === 0) return;
        await this.placeLocalDataSource.cacheWriteMany(domainList, requestContext);

        // The server snapshot is authoritative for this scope: prune cached rows it no longer
        // lists (e.g. the embedded-$site default place written into a cloud partition, ADR-0045).
        // Only a full snapshot (no query) may prune — a filtered response proves nothing about
        // the rows it omits.
        if (query != null) return;
        const serverIds = new Set(domainList.map(item => item.id));
        const localResult = await this.placeLocalDataSource.cacheReadList(undefined, requestContext);
        const staleIds = (localResult?.list || [])
            .map(item => item.id)
            .filter((id): id is string => !!id && !serverIds.has(id) && id !== protectedId);
        if (staleIds.length > 0) {
            await this.placeLocalDataSource.cacheDeleteMany(staleIds, requestContext);
        }
    }

    public async createPlace(payload: PlaceCreateInput): Promise<DomainPlace> {
        const requestContext = this.getRequestContext();
        const normalizedContext = this.getNormalizedContext(requestContext);
        const domain = await this.placeRemoteDataSource.createPlace(payload, normalizedContext);
        await this.placeLocalDataSource.cacheWrite(domain, requestContext);
        // Follow up with the server snapshot so the list lands ordered (`order` stamps only come
        // from the list response) — inside the repository so every caller benefits. The place
        // already exists on the server, so a failed snapshot must not fail the create; the next
        // background-sync tick converges the list instead.
        try {
            await this.syncListSnapshot(undefined, domain.id);
        } catch {
            // best-effort
        }
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
        // place.update requires `@id`, and a place's id IS its sid — normalize sid-only payloads
        // so the remote call succeeds and the optimistic write/rollback below stays engaged.
        const { id: rawId, sid } = payload as { id?: string; sid?: string };
        const id = rawId || sid;
        const normalized = (!rawId && sid ? { ...(payload as object), id: sid } : payload) as PlaceUpdateInput;
        const requestContext = this.getRequestContext();
        const normalizedContext = this.getNormalizedContext(requestContext);
        const existing = id ? await this.placeLocalDataSource.cacheRead(id, requestContext) : null;
        if (id) {
            await this.placeLocalDataSource.cacheWrite({ id, ...(normalized as Partial<DomainPlace>) }, requestContext);
        }
        try {
            const domain = await this.placeRemoteDataSource.updatePlace(normalized, normalizedContext);
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
