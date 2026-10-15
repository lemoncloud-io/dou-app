import type { UserMySiteInput } from '@lemoncloud/chatic-sockets-api';
import { logger } from '@chatic/bridges';
import type { DomainListResult, DomainPlace } from '../domain';
import type { IPlaceLocalDataSource, LocalDataSourceContextOverride } from '../local/data-sources';
import type {
    IPlaceSocketDataSource,
    PlaceCreateInput,
    PlaceLeaveResult,
    PlaceUpdateInput,
} from '../remote/socket-data-sources';
import type { IChannelRepository } from './ChannelRepository';
import { placeListEmptyReporter, type PlaceListScope } from './placeListEmptyReporter';
import { isNotFoundError } from './socketError';
import type { DataContextProvider } from './types';
import { BaseRepository, type DisposableRepository } from './types';

/**
 * The channel cache work a place leave owes. The channel repository owns it — the leave guard that
 * keeps a late snapshot from restoring a left room lives there, and nowhere else.
 */
export type PlaceChannelCleanup = Pick<IChannelRepository, 'evictLeftChannels' | 'dropMemberFromChannels'>;

/**
 * A place its owner deleted. The delete is soft: the server keeps the row, stamps `deletedAt`, and goes
 * on listing it to the people who were in it, so a stamped row is as good as gone.
 */
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
    /**
     * `place.leave` for myself. Once the server has answered, the place row and the group channels it
     * took me out of leave the cache. Throws, with the cache untouched, when the server refuses.
     */
    leavePlace(id: string): Promise<PlaceLeaveResult>;
    /**
     * `place.leave` with a target — the place owner removes `userId`. The place row stays; the member
     * drops out of the cached rosters of the channels the server took them out of.
     */
    removeMember(id: string, userId: string): Promise<PlaceLeaveResult>;
    /**
     * Asks the server whether the place has been deleted (`place.get`: 404, or a row stamped
     * `deletedAt`). A place I left or was removed from is still there and answers false. Any other
     * failure rejects — it says nothing either way.
     */
    isPlaceDeleted(id: string): Promise<boolean>;

    cacheReadList(query?: UserMySiteInput): Promise<DomainListResult<DomainPlace> | null>;
    cacheWrite(item: Partial<DomainPlace>): Promise<void>;
    cacheDelete(id: string): Promise<void>;
    cacheClear(): Promise<void>;
}

/** Keeps place cache in sync and rolls back optimistic mutations when remote writes fail. */
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
        // A caller-supplied override pins the observer scope to a known {cid, uid} (see useActiveCloudPlaces);
        // otherwise fall back to the live repository context.
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

    /**
     * Pulls the server place snapshot and reconciles the local cache against it: server order is
     * stamped as `order`, and rows the server no longer returns are pruned (mirrors the
     * ChannelRepository.refreshList idiom). `protectedId` shields a just-created place whose row
     * may not have propagated into the list response yet.
     */
    private async syncListSnapshot(query?: UserMySiteInput, protectedId?: string): Promise<void> {
        const requestContext = this.getRequestContext();
        // The socket that answers `user.mysite` may still serve the OUTGOING cloud during a
        // switch (cache cid already flipped). Writing or pruning its list would poison the target
        // partition, and nothing is owed to the caller, so don't even ask.
        if (!this.acceptsAnswer(requestContext, 'place-refresh')) return;
        const normalizedContext = this.getNormalizedContext(requestContext);
        const remote = await this.placeSocketDataSource.fetchPlace(query, normalizedContext);
        const listed = (remote.list || []).filter(item => !!item.id);
        // Only a full snapshot of a CLOUD says whether the account has a place there. The relay's one
        // place comes from the profile's embedded site, not from this list, which a guest relay
        // session answers empty on every boot. The snapshot a create follows up with is skipped
        // when empty too: the place it just made may not be listed yet, and that is the list
        // lagging, not the account having no place.
        const scope: PlaceListScope = { cid: normalizedContext.cid ?? 'default', uid: normalizedContext.uid };
        const isFullSnapshot = query == null && scope.cid !== 'default';
        const reportsEmpty = isFullSnapshot && protectedId == null;
        // Nothing usable came back — leave the cache entirely alone. Right after a switch the
        // session may not be ready and answer empty; writing or pruning against that would wipe
        // the real rows. A genuinely empty account settles on a later response.
        if (listed.length === 0) {
            if (reportsEmpty) placeListEmptyReporter.empty(scope, 0);
            return;
        }
        // A deleted place stays in the list, stamped `deletedAt`. It is not written, and, being
        // absent from the ids below, its cached row is pruned. Server order is stamped as `order`
        // over the live rows only.
        const domainList = listed
            .filter(item => !isDeletedPlace(item))
            .map((item, index) => ({ ...item, order: index }));
        if (isFullSnapshot && domainList.length > 0) placeListEmptyReporter.filled(scope);
        else if (reportsEmpty && domainList.length === 0) placeListEmptyReporter.empty(scope, listed.length);
        if (domainList.length > 0) await this.placeLocalDataSource.cacheWriteMany(domainList, requestContext);

        // The server snapshot is authoritative for this scope: prune cached rows it no longer
        // lists (e.g. the embedded-$site default place written into a cloud partition, ADR-0094).
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
        const domain = await this.placeSocketDataSource.createPlace(payload, normalizedContext);
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
            const domain = await this.placeSocketDataSource.updatePlace(normalized, normalizedContext);
            await this.placeLocalDataSource.cacheWrite(domain, requestContext);
            return domain;
        } catch (error) {
            if (existing) {
                // The cache write merges into the stored row, so the old row alone would leave
                // behind a field the patch added (a photo on a place that had none). Each patched
                // field is cleared first, and the old row then puts back the ones it had.
                const cleared = Object.fromEntries(Object.keys(normalized as object).map(key => [key, undefined]));
                await this.placeLocalDataSource.cacheWrite({ ...cleared, ...existing }, requestContext);
            }
            throw error;
        }
    }

    /**
     * Deletes a place on the server, then drops its row from the cache.
     *
     * Not optimistic, unlike the channel delete. A place the session is inside leaves the list the
     * moment its row goes, and the app moves the session to another place when that happens; a
     * refusal that then put the row back would not move the session back with it. So the row stays
     * until the server has said yes.
     *
     * The row is dropped here rather than left to the next list snapshot: that snapshot does not
     * touch the cache when it comes back empty, so the last place of a cloud would never go.
     *
     * Only the place row goes. The cached channels of the place are left for the channel sync to
     * settle, as they are when a place disappears from a list snapshot.
     */
    public async deletePlace(id: string): Promise<void> {
        const requestContext = this.getRequestContext();
        await this.placeSocketDataSource.deletePlace({ id });
        // The scope the request started in, so a cloud change while it ran cannot aim the delete
        // at another cloud's partition.
        await this.placeLocalDataSource.cacheDelete(id, requestContext);
    }

    /**
     * Leaves a place, then clears what I no longer belong to from the cache.
     *
     * Not optimistic, for the reason the delete is not: the server refuses an owner, and a row that
     * vanished and came back would have moved the session out of the place for nothing.
     *
     * The channels cleared are the ones the server names in `leftChannelIds`, never "the cached
     * channels of this place": what the server actually took me out of is the record, and a cached
     * row's place tag can be stale.
     *
     * The place row is dropped here even when it is the last one — the list snapshot leaves the cache
     * alone when it comes back empty, so nothing else would ever remove it.
     */
    public async leavePlace(id: string): Promise<PlaceLeaveResult> {
        // The scope the request started in: a cloud change while it ran must not aim the clean-up
        // at another cloud's partition.
        const requestContext = this.getRequestContext();
        const result = await this.placeSocketDataSource.leavePlace({ id });
        this.noteFailedChannels(id, result);
        // From here on the leave has happened. A cache write that fails is logged, not thrown: the
        // caller would otherwise tell the user to try again, and the server would refuse a second
        // leave from someone who is no longer a member.
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
        // The member is already out on the server; a roster that cannot be corrected is not a failure.
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

    /**
     * A channel the server could not take the person out of is one it already counted them out of, so
     * the leave still succeeded. Logged so a pattern of them can be seen; nothing to ask the user.
     */
    private noteFailedChannels(id: string, result: PlaceLeaveResult, userId?: string): void {
        if (!result.failedChannelIds?.length) return;
        logger.warn('PLACE', '[PlaceRepository] place.leave could not leave some channels', {
            data: { placeId: id, userId, failedChannelIds: result.failedChannelIds },
        });
    }
}
