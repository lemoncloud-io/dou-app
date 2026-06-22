import type { UserMySiteInput } from '@lemoncloud/chatic-sockets-api';
import type { DomainListResult, DomainSite } from '../../domain';
import { createDomainListResult, toDomainSite } from '../../domain';
import type { DataContextProvider } from '../../repositories';
import type { CacheStorage, CacheStorageItem } from '../storages';
import {
    BaseLocalDataSourceV2,
    type ILocalDataSourceV2,
    type LocalDataSourceV2Callback,
    type LocalDataSourceV2ContextOverride,
    type LocalDataSourceV2Unsubscribe,
} from './types';

type SiteCache = CacheStorageItem<'site'>;

const getSiteSortValue = (site: Pick<DomainSite, 'name' | 'id'> & { order?: number }): string => {
    const order = site.order ?? Number.MAX_SAFE_INTEGER;
    const name = site.name ?? site.id ?? '';
    return `${String(order).padStart(10, '0')}:${name}`;
};

export interface ISiteLocalDataSourceV2
    extends ILocalDataSourceV2<DomainSite, UserMySiteInput | undefined, DomainListResult<DomainSite>> {}

/** Stores site records in local cache and keeps list observers aligned with sorted site output. */
export class SiteLocalDataSourceV2 extends BaseLocalDataSourceV2 implements ISiteLocalDataSourceV2 {
    constructor(
        contextProvider: DataContextProvider,
        private readonly cacheStorage: CacheStorage<'site'>
    ) {
        super(contextProvider);
    }

    public async cacheRead(id: string, contextOverride?: LocalDataSourceV2ContextOverride): Promise<DomainSite | null> {
        const requiredId = this.assertRequiredString(id, 'id');
        const item = await this.cacheStorage.load(requiredId);
        return item ? toDomainSite(item, this.getReadScope(item, contextOverride)) : null;
    }

    public async cacheReadList(
        _query: UserMySiteInput | undefined,
        contextOverride?: LocalDataSourceV2ContextOverride
    ): Promise<DomainListResult<DomainSite> | null> {
        const items = await this.cacheStorage.loadAll();
        const list = items
            .map(item => toDomainSite(item, this.getReadScope(item, contextOverride)))
            .sort((left, right) => getSiteSortValue(left).localeCompare(getSiteSortValue(right)));

        return createDomainListResult(list, {
            total: list.length,
            source: 'local',
        });
    }

    public observeItem(
        id: string,
        callback: LocalDataSourceV2Callback<DomainSite | null>,
        contextOverride?: LocalDataSourceV2ContextOverride
    ): LocalDataSourceV2Unsubscribe {
        return this.observeItemQuery(id, () => this.cacheRead(id, contextOverride), callback);
    }

    public observeList(
        query: UserMySiteInput | undefined,
        callback: LocalDataSourceV2Callback<DomainListResult<DomainSite> | null>,
        contextOverride?: LocalDataSourceV2ContextOverride
    ): LocalDataSourceV2Unsubscribe {
        return this.observeListQuery(
            this.createListObserverKey(['sites'], contextOverride),
            () => this.cacheReadList(query, contextOverride),
            callback
        );
    }

    public async cacheWrite(
        item: Partial<DomainSite>,
        contextOverride?: LocalDataSourceV2ContextOverride
    ): Promise<void> {
        const id = this.assertRequiredString(item.id, 'id');
        const existing = await this.cacheStorage.load(id);
        const context = this.getContext(contextOverride);
        const cid = context.cid || this.getCid(contextOverride);
        const normalized = toDomainSite(
            {
                ...(existing ?? {}),
                ...(item as Record<string, unknown>),
                cid,
            } as Partial<DomainSite>,
            {
                cid,
                sid: context.sid,
                uid: context.uid,
            }
        );
        await this.cacheStorage.save(id, normalized as SiteCache);
        this.scheduleItemReemit([id]);
        this.scheduleListReemit([`${this.getScopeKey(contextOverride)}|sites`]);
    }

    public async cacheWriteMany(
        items: Array<Partial<DomainSite>>,
        contextOverride?: LocalDataSourceV2ContextOverride
    ): Promise<void> {
        const validItems = items.filter(item => !!item.id);
        if (validItems.length === 0) return;

        const context = this.getContext(contextOverride);
        const cid = context.cid || this.getCid(contextOverride);
        const existingItems = await Promise.all(validItems.map(item => this.cacheStorage.load(item.id!)));
        const normalized = validItems.map(
            (item, index) =>
                toDomainSite(
                    {
                        ...(existingItems[index] ?? {}),
                        ...(item as Record<string, unknown>),
                        cid,
                    } as Partial<DomainSite>,
                    {
                        cid,
                        sid: context.sid,
                        uid: context.uid,
                    }
                ) as SiteCache
        );

        await this.cacheStorage.saveAll(normalized);
        this.scheduleItemReemit(validItems.map(item => item.id!).filter(Boolean));
        this.scheduleListReemit([`${this.getScopeKey(contextOverride)}|sites`]);
    }

    public async cacheDelete(id: string, contextOverride?: LocalDataSourceV2ContextOverride): Promise<void> {
        const requiredId = this.assertRequiredString(id, 'id');
        await this.cacheStorage.delete(requiredId);
        this.scheduleItemReemit([requiredId]);
        this.scheduleListReemit([`${this.getScopeKey(contextOverride)}|sites`]);
    }

    public async cacheDeleteMany(ids: string[], contextOverride?: LocalDataSourceV2ContextOverride): Promise<void> {
        const validIds = ids.filter(Boolean);
        if (validIds.length === 0) return;
        await this.cacheStorage.deleteAll(validIds);
        this.scheduleItemReemit(validIds);
        this.scheduleListReemit([`${this.getScopeKey(contextOverride)}|sites`]);
    }

    public async cacheClear(_contextOverride?: LocalDataSourceV2ContextOverride): Promise<void> {
        await this.cacheStorage.clearAll();
        this.scheduleFullReemit();
    }

    private getReadScope(
        item: { cid?: string } | undefined,
        contextOverride?: LocalDataSourceV2ContextOverride
    ): { cid: string; sid?: string; uid?: string } {
        return {
            cid: item?.cid || this.getCid(contextOverride),
            sid: this.getSid(contextOverride),
            uid: this.getUid(contextOverride),
        };
    }
}
