import type { WSSPayload } from '@lemoncloud/chatic-sockets-api';
import type { CacheStorage, CacheStorageItem } from '../storages';
import {
    BaseLocalDataSource,
    type ICrudLocalDataSource,
    type IListLocalDataSource,
    type IStreamLocalDataSource,
    type LocalDataSourceContextOverride,
    type LocalStreamCallback,
    type LocalStreamUnsubscribe,
} from './types';
import type { DataContextProvider } from '../../repositories';
import { toDomainSite } from './mappers';
import { createDomainListResult, type DomainListResult, type DomainSite } from '../../domain';
import { toDomainSite as toDomainSiteBase } from '../../domain';

export interface ISiteLocalDataSource
    extends ICrudLocalDataSource<DomainSite>,
        IListLocalDataSource<DomainSite, WSSPayload | undefined>,
        IStreamLocalDataSource<DomainSite, WSSPayload | undefined, DomainListResult<DomainSite>> {}

type SiteCache = CacheStorageItem<'site'>;

const getSiteSortValue = (site: Pick<DomainSite, 'name' | 'id'> & { order?: number }): string => {
    const order = site.order ?? Number.MAX_SAFE_INTEGER;
    const name = site.name ?? site.id ?? '';
    return `${String(order).padStart(10, '0')}:${name}`;
};

/** 사이트/플레이스 캐시 read/write를 담당합니다. */
export class SiteLocalDataSource extends BaseLocalDataSource implements ISiteLocalDataSource {
    constructor(
        protected override readonly contextProvider: DataContextProvider,
        protected readonly cacheStorage: CacheStorage<'site'>
    ) {
        super(contextProvider);
    }

    // =========================================================================
    // 1. 공통 CRUD 인터페이스 (ICrudLocalDataSource)
    // =========================================================================

    public async getById(id: string, _contextOverride?: LocalDataSourceContextOverride): Promise<DomainSite | null> {
        if (!id) return null;
        const item = await this.cacheStorage.load(id);
        return item ? toDomainSite(item) : null;
    }

    public async upsert(site: Partial<DomainSite>, contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        const id = site.id;
        if (!id) return;

        const context = this.getContext(contextOverride);
        const existing = await this.cacheStorage.load(id);
        const normalized = toDomainSiteBase(
            {
                ...(existing ?? {}),
                ...(site as Record<string, unknown>),
                cid: context.cid || this.getCid(contextOverride),
            } as Partial<DomainSite>,
            {
                cid: context.cid || this.getCid(contextOverride),
                sid: context.sid,
                uid: context.uid,
            }
        );
        const cacheItem: SiteCache = normalized as SiteCache;
        await this.cacheStorage.save(id, cacheItem);
        await this.emitAllStreams();
    }

    public async upsertMany(
        sites: Array<Partial<DomainSite>>,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<void> {
        if (sites.length === 0) return;

        const context = this.getContext(contextOverride);
        const cid = context.cid || this.getCid(contextOverride);
        const baseScope = { cid, sid: context.sid, uid: context.uid };

        const existingItems = await Promise.all(sites.map(site => (site.id ? this.cacheStorage.load(site.id) : null)));

        const cacheItemsToSave: SiteCache[] = [];
        sites.forEach((site, index) => {
            if (!site.id) return;
            const existing = existingItems[index];
            const normalized = toDomainSiteBase(
                {
                    ...(existing ?? {}),
                    ...(site as Record<string, unknown>),
                    cid,
                } as Partial<DomainSite>,
                baseScope
            );
            cacheItemsToSave.push(normalized as SiteCache);
        });

        if (cacheItemsToSave.length > 0) {
            await this.cacheStorage.saveAll(cacheItemsToSave);
            await this.emitAllStreams();
        }
    }

    public async remove(id: string, _contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        if (!id) return;
        await this.cacheStorage.delete(id);
        await this.emitAllStreams();
    }

    public async removeMany(ids: string[], _contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        const validIds = ids.filter(Boolean);
        if (validIds.length === 0) return;
        await this.cacheStorage.deleteAll(validIds);
        await this.emitAllStreams();
    }

    public async clearAll(_contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        await this.cacheStorage.clearAll();
        await this.emitAllStreams();
    }

    // =========================================================================
    // 3. 공통 List/Stream 인터페이스
    // =========================================================================

    public async fetchList(
        _query: WSSPayload | undefined,
        _contextOverride?: LocalDataSourceContextOverride
    ): Promise<DomainListResult<DomainSite> | null> {
        const sites = await this.cacheStorage.loadAll();

        if (sites.length === 0) {
            return createDomainListResult([], { total: 0, source: 'local' });
        }

        const domainSites = sites.map(toDomainSite);
        const sorted = domainSites.sort((left, right) => getSiteSortValue(left).localeCompare(getSiteSortValue(right)));

        return createDomainListResult(sorted, {
            total: sorted.length,
            source: 'local',
        });
    }

    public subscribeList(
        query: WSSPayload | undefined,
        callback: LocalStreamCallback<DomainListResult<DomainSite> | null>,
        contextOverride?: LocalDataSourceContextOverride
    ): LocalStreamUnsubscribe {
        return this.subscribeQueryStream(() => this.fetchList(query, contextOverride), callback);
    }

    public subscribeItem(
        id: string,
        callback: LocalStreamCallback<DomainSite | null>,
        contextOverride?: LocalDataSourceContextOverride
    ): LocalStreamUnsubscribe {
        return this.subscribeQueryStream(() => this.getById(id, contextOverride), callback);
    }
}
