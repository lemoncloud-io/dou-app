import type { UserMySiteInput } from '@lemoncloud/chatic-sockets-api';
import type { DomainListResult, DomainPlace } from '../../domain';
import { createDomainListResult } from '../../domain';
import type { DataContextProvider } from '../../repositories-v2/types';
import { stableHash } from '../storages';
import type { CacheStorage } from '../storages';
import {
    BaseLocalDataSourceV2,
    type ILocalDataSourceV2,
    type LocalDataSourceV2Callback,
    type LocalDataSourceV2ContextOverride,
    type LocalDataSourceV2Unsubscribe,
} from './types';

// Place reuses the existing 'site' cache slot — site and place are the same entity.
export interface IPlaceLocalDataSourceV2
    extends ILocalDataSourceV2<DomainPlace, UserMySiteInput | undefined, DomainListResult<DomainPlace>> {}

/**
 * The relay's single personal place (mirrors apps/web's `HOME_PLACE_ID` in
 * `utils/resolvePlaceDisplayName.ts` — duplicated rather than imported, since apps/web depends on
 * this package and not the other way around). It can only legitimately live under the
 * relay/default partition.
 *
 * A row with this id tagged with any other `cid` is embedded-`$site` pollution: `UserRepositoryV2`
 * used to cache the relay's `$site` from `getMyProfile()` under whatever partition happened to be
 * active, so a fetch that landed while a cloud was active wrote this row into that cloud's own
 * partition (relay-default-place-scoping.md). A write-time gate (`persistEmbeddedSite`) now guards
 * against NEW rows, but does nothing for one already sitting in the store from before the guard
 * existed — filtering read-time is what actually keeps it from resurfacing, regardless of how or
 * when it got written.
 */
const RELAY_HOME_PLACE_ID = '0000';

const isMistaggedHomePlace = (item: Pick<DomainPlace, 'id' | 'cid'>): boolean =>
    item.id === RELAY_HOME_PLACE_ID && item.cid !== 'default';

/** Stores place records in local cache and keeps list observers aligned with sorted place output. */
export class PlaceLocalDataSourceV2 extends BaseLocalDataSourceV2 implements IPlaceLocalDataSourceV2 {
    constructor(
        contextProvider: DataContextProvider,
        private readonly cacheStorage: CacheStorage<'site'>
    ) {
        super(contextProvider);
    }

    /**
     * Place/site is a cloud-level entity (still isolated per cloud by `cid`), but the base observer
     * scope additionally keys by `sid`. On a cloud switch the active sid is cleared and re-selected
     * on a separate timeline, so a place write made under one sid never reemits an observer that
     * subscribed under a different sid — the rail then stays empty even though the rows are cached
     * (observed live: placeCache>0 yet usePlaces sees nothing). The storage layer already partitions
     * places by {cid, uid} only (resolveScopedContext), so drop sid from the observer scope to match:
     * every place observer for a cloud is reemitted regardless of the transient active place. `cid`
     * remains in the key, so clouds stay isolated (no cross-cloud bleed).
     */
    protected override getScopeKey(contextOverride?: LocalDataSourceV2ContextOverride): string {
        const context = this.getContext(contextOverride);
        return stableHash({ cid: context.cid || 'default', sid: '', uid: context.uid || 'default' });
    }

    public async cacheRead(
        id: string,
        _contextOverride?: LocalDataSourceV2ContextOverride
    ): Promise<DomainPlace | null> {
        const requiredId = this.assertRequiredString(id, 'id');
        const item = await this.cacheStorage.load(requiredId);
        return item && isMistaggedHomePlace(item) ? null : item;
    }

    public async cacheReadList(
        _query: UserMySiteInput | undefined,
        _contextOverride?: LocalDataSourceV2ContextOverride
    ): Promise<DomainListResult<DomainPlace> | null> {
        const items = (await this.cacheStorage.loadAll()).filter(item => !isMistaggedHomePlace(item));
        // Default ordering is by id (ascending, numeric-aware) so the place rail stays stable
        // and predictable regardless of server-provided order/name.
        const list = [...items].sort((left, right) =>
            String(left.id ?? '').localeCompare(String(right.id ?? ''), undefined, { numeric: true })
        );

        return createDomainListResult(list, {
            total: list.length,
            source: 'local',
        });
    }

    public observeItem(
        id: string,
        callback: LocalDataSourceV2Callback<DomainPlace | null>,
        contextOverride?: LocalDataSourceV2ContextOverride
    ): LocalDataSourceV2Unsubscribe {
        return this.observeItemQuery(id, () => this.cacheRead(id, contextOverride), callback);
    }

    public observeList(
        query: UserMySiteInput | undefined,
        callback: LocalDataSourceV2Callback<DomainListResult<DomainPlace> | null>,
        contextOverride?: LocalDataSourceV2ContextOverride
    ): LocalDataSourceV2Unsubscribe {
        return this.observeListQuery(
            this.createListObserverKey(['places'], contextOverride),
            () => this.cacheReadList(query, contextOverride),
            callback
        );
    }

    public async cacheWrite(
        item: Partial<DomainPlace>,
        contextOverride?: LocalDataSourceV2ContextOverride
    ): Promise<void> {
        const id = this.assertRequiredString(item.id, 'id');
        const existing = await this.cacheStorage.load(id);
        const context = this.getContext(contextOverride);
        const cid = context.cid || 'default';
        const merged: DomainPlace = {
            ...(existing ?? ({} as DomainPlace)),
            ...item,
            id,
            cid,
            order: item.order ?? existing?.order ?? Number.MAX_SAFE_INTEGER,
        };
        await this.cacheStorage.save(id, merged);
        this.scheduleItemReemit([id]);
        this.scheduleListReemit([`${this.getScopeKey(contextOverride)}|places`]);
    }

    public async cacheWriteMany(
        items: Array<Partial<DomainPlace>>,
        contextOverride?: LocalDataSourceV2ContextOverride
    ): Promise<void> {
        const validItems = items.filter(item => !!item.id);
        if (validItems.length === 0) return;

        const context = this.getContext(contextOverride);
        const cid = context.cid || 'default';
        const existingItems = await Promise.all(validItems.map(item => this.cacheStorage.load(item.id!)));
        const mergedList = validItems.map((item, index) => {
            const existing = existingItems[index];
            return {
                ...(existing ?? ({} as DomainPlace)),
                ...item,
                id: item.id!,
                cid,
                order: item.order ?? existing?.order ?? Number.MAX_SAFE_INTEGER,
            } as DomainPlace;
        });

        await this.cacheStorage.saveAll(mergedList);
        this.scheduleItemReemit(validItems.map(item => item.id!).filter(Boolean));
        this.scheduleListReemit([`${this.getScopeKey(contextOverride)}|places`]);
    }

    public async cacheDelete(id: string, contextOverride?: LocalDataSourceV2ContextOverride): Promise<void> {
        const requiredId = this.assertRequiredString(id, 'id');
        await this.cacheStorage.delete(requiredId);
        this.scheduleItemReemit([requiredId]);
        this.scheduleListReemit([`${this.getScopeKey(contextOverride)}|places`]);
    }

    public async cacheDeleteMany(ids: string[], contextOverride?: LocalDataSourceV2ContextOverride): Promise<void> {
        const validIds = ids.filter(Boolean);
        if (validIds.length === 0) return;
        await this.cacheStorage.deleteAll(validIds);
        this.scheduleItemReemit(validIds);
        this.scheduleListReemit([`${this.getScopeKey(contextOverride)}|places`]);
    }

    public async cacheClear(_contextOverride?: LocalDataSourceV2ContextOverride): Promise<void> {
        await this.cacheStorage.clearAll();
        this.scheduleFullReemit();
    }
}
