import type { UserMySiteInput } from '@lemoncloud/chatic-sockets-api';
import { logger } from '@chatic/logger';
import type { DomainListResult, DomainPlace } from '@chatic/data-model';
import type { IPlaceLocalDataSource, LocalDataSourceContextOverride } from '@chatic/data-local';
import type { IPlaceSocketDataSource, PlaceCreateInput, PlaceLeaveResult, PlaceUpdateInput } from '@chatic/data-api';
import type { IChannelRepository } from './ChannelRepository';
import { isNotFoundError } from './socketError';
import type { DataContextProvider } from './types';
import { BaseRepository, type DisposableRepository } from './types';

export type PlaceChannelCleanup = Pick<IChannelRepository, 'evictLeftChannels' | 'dropMemberFromChannels'>;

export const isDeletedPlace = (place: Pick<DomainPlace, 'deletedAt'> | null | undefined): boolean =>
    Number(place?.deletedAt ?? 0) > 0;

export interface IPlaceRepository extends DisposableRepository {
    observeList(
        query: UserMySiteInput | undefined,
        callback: (result: DomainListResult<DomainPlace> | null) => void,
        contextOverride?: LocalDataSourceContextOverride
    ): () => void;
    observeItem(id: string, callback: (item: DomainPlace | null) => void): () => void;

    refreshList(query?: UserMySiteInput): Promise<void>;
    createPlace(payload: PlaceCreateInput): Promise<DomainPlace>;
    updatePlace(payload: PlaceUpdateInput): Promise<DomainPlace>;
    deletePlace(id: string): Promise<void>;
    leavePlace(id: string): Promise<PlaceLeaveResult>;
    removeMember(id: string, userId: string): Promise<PlaceLeaveResult>;
    isPlaceDeleted(id: string): Promise<boolean>;

    cacheReadList(query?: UserMySiteInput): Promise<DomainListResult<DomainPlace> | null>;
    cacheWrite(item: Partial<DomainPlace>): Promise<void>;
    cacheDelete(id: string): Promise<void>;
    cacheClear(): Promise<void>;
}

export class PlaceRepository extends BaseRepository implements IPlaceRepository {
    constructor(
        private readonly placeSocketDataSource: IPlaceSocketDataSource,
        private readonly placeLocalDataSource: IPlaceLocalDataSource,
        contextProvider: DataContextProvider,
        private readonly channelCleanup: PlaceChannelCleanup
    ) {
        super(contextProvider);
    }

    public observeList(
        query: UserMySiteInput | undefined,
        callback: (result: DomainListResult<DomainPlace> | null) => void,
        contextOverride?: LocalDataSourceContextOverride
    ): () => void {
        return this.placeLocalDataSource.observeList(query, callback, contextOverride ?? this.getRepositoryContext());
    }

    public observeItem(id: string, callback: (item: DomainPlace | null) => void): () => void {
        return this.placeLocalDataSource.observeItem(id, callback, this.getRepositoryContext());
    }

    public cacheReadList(query?: UserMySiteInput): Promise<DomainListResult<DomainPlace> | null> {
        return this.placeLocalDataSource.cacheReadList(query, this.getRepositoryContext());
    }

    public cacheWrite(item: Partial<DomainPlace>): Promise<void> {
        return this.placeLocalDataSource.cacheWrite(item, this.getRepositoryContext());
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

    private async syncListSnapshot(query?: UserMySiteInput, protectedId?: string): Promise<void> {
        const requestContext = this.getRequestContext();
        if (!this.acceptsAnswer(requestContext, 'place-refresh')) return;
        const normalizedContext = this.getNormalizedContext(requestContext);
        const remote = await this.placeSocketDataSource.fetchPlace(query, normalizedContext);
        const listed = (remote.list || []).filter(item => !!item.id);
        if (listed.length === 0) return;
        const domainList = listed
            .filter(item => !isDeletedPlace(item))
            .map((item, index) => ({ ...item, order: index }));
        if (domainList.length > 0) await this.placeLocalDataSource.cacheWriteMany(domainList, requestContext);

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
        const domain = await this.placeSocketDataSource.createPlace(payload, normalizedContext);
        await this.placeLocalDataSource.cacheWrite(domain, requestContext);
        try {
            await this.syncListSnapshot(undefined, domain.id);
        } catch {
            // best-effort
        }
        return domain;
    }

    public async updatePlace(payload: PlaceUpdateInput): Promise<DomainPlace> {
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
            const domain = await this.placeSocketDataSource.updatePlace(normalized, normalizedContext);
            await this.placeLocalDataSource.cacheWrite(domain, requestContext);
            return domain;
        } catch (error) {
            if (existing) {
                const cleared = Object.fromEntries(Object.keys(normalized as object).map(key => [key, undefined]));
                await this.placeLocalDataSource.cacheWrite({ ...cleared, ...existing }, requestContext);
            }
            throw error;
        }
    }

    public async deletePlace(id: string): Promise<void> {
        const requestContext = this.getRequestContext();
        await this.placeSocketDataSource.deletePlace({ id });
        await this.placeLocalDataSource.cacheDelete(id, requestContext);
    }

    public async leavePlace(id: string): Promise<PlaceLeaveResult> {
        const requestContext = this.getRequestContext();
        const result = await this.placeSocketDataSource.leavePlace({ id });
        this.noteFailedChannels(id, result);
        await this.bestEffort('evict left channels', id, () =>
            this.channelCleanup.evictLeftChannels(result.leftChannelIds ?? [], requestContext)
        );
        await this.bestEffort('drop the place row', id, () =>
            this.placeLocalDataSource.cacheDelete(id, requestContext)
        );
        return result;
    }

    public async removeMember(id: string, userId: string): Promise<PlaceLeaveResult> {
        const requestContext = this.getRequestContext();
        const result = await this.placeSocketDataSource.leavePlace({ id, userId });
        this.noteFailedChannels(id, result, userId);
        await this.bestEffort('drop the member from rosters', id, () =>
            this.channelCleanup.dropMemberFromChannels(result.leftChannelIds ?? [], userId, requestContext)
        );
        return result;
    }

    private async bestEffort(step: string, id: string, run: () => Promise<void>): Promise<void> {
        try {
            await run();
        } catch (error) {
            logger.warn('PLACE', `[PlaceRepository] place.leave succeeded but could not ${step}`, {
                error,
                data: { placeId: id },
            });
        }
    }

    public async isPlaceDeleted(id: string): Promise<boolean> {
        const requestContext = this.getRequestContext();
        try {
            const place = await this.placeSocketDataSource.getPlace(id, this.getNormalizedContext(requestContext));
            return isDeletedPlace(place);
        } catch (error) {
            if (isNotFoundError(error)) return true;
            throw error;
        }
    }

    private noteFailedChannels(id: string, result: PlaceLeaveResult, userId?: string): void {
        if (!result.failedChannelIds?.length) return;
        logger.warn('PLACE', '[PlaceRepository] place.leave could not leave some channels', {
            data: { placeId: id, userId, failedChannelIds: result.failedChannelIds },
        });
    }
}
