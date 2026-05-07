import type { WSSPayload } from '@lemoncloud/chatic-sockets-api';
import type { ListResult } from '../../events/types';
import type { CacheStorage, CacheStorageItem } from '../storages';
import { BaseLocalDataSource, type LocalDataSourceContextOverride } from './types';
import type { DataContextProvider } from '../../repositories';
import { toDomainSite } from './mappers';
import type { DomainSite } from '../../domain';
import { toDomainSite as toDomainSiteBase } from '../../domain';

export interface ISiteLocalDataSource {
    /** 사이트 목록을 로컬 캐시에서 조회합니다. */
    fetchSite(
        payload?: WSSPayload,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<ListResult<DomainSite> | null>;
    /** 단일 사이트를 저장/병합합니다. */
    upsertSite(site: Partial<DomainSite>, contextOverride?: LocalDataSourceContextOverride): Promise<void>;
    /** 다수 사이트를 저장/병합합니다. */
    upsertSites(sites: Array<Partial<DomainSite>>, contextOverride?: LocalDataSourceContextOverride): Promise<void>;
    /** 기존 사이트 캐시를 신규 목록으로 교체합니다. */
    replaceSites(sites: Array<Partial<DomainSite>>, contextOverride?: LocalDataSourceContextOverride): Promise<void>;
    /** 단일 사이트를 삭제합니다. */
    deleteSite(id: string, contextOverride?: LocalDataSourceContextOverride): Promise<void>;
    /** 다중 사이트를 삭제합니다. */
    deleteSites(ids: string[], contextOverride?: LocalDataSourceContextOverride): Promise<void>;
    /** 단일 사이트 일부 필드만 병합 업데이트합니다. */
    updateSitePartial(
        id: string,
        patch: Partial<DomainSite>,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<void>;
    /** 현재 스코프 사이트 캐시를 초기화합니다. */
    clearAll(contextOverride?: LocalDataSourceContextOverride): Promise<void>;
}

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

    public async fetchSite(
        _payload?: WSSPayload,
        _contextOverride?: LocalDataSourceContextOverride
    ): Promise<ListResult<DomainSite> | null> {
        const sites = await this.cacheStorage.loadAll();
        if (sites.length === 0) return null;

        const domainSites = sites.map(toDomainSite);
        const sorted = domainSites.sort((left, right) => getSiteSortValue(left).localeCompare(getSiteSortValue(right)));

        return {
            list: sorted,
            total: sorted.length,
        };
    }

    public async upsertSite(
        site: Partial<DomainSite>,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<void> {
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
    }

    public async upsertSites(
        sites: Array<Partial<DomainSite>>,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<void> {
        if (sites.length === 0) return;

        const context = this.getContext(contextOverride);
        const cid = context.cid || this.getCid(contextOverride);
        const baseScope = { cid, sid: context.sid, uid: context.uid };

        // 기존 데이터 일괄 로드 (병합용)
        const existingItems = await Promise.all(sites.map(site => (site.id ? this.cacheStorage.load(site.id) : null)));

        //  메모리에서 정규화 및 병합
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

        // 브릿지 통신을 1회로 단축하여 일괄 저장
        if (cacheItemsToSave.length > 0) {
            await this.cacheStorage.saveAll(cacheItemsToSave);
        }
    }

    public async replaceSites(
        sites: Array<Partial<DomainSite>>,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<void> {
        const context = this.getContext(contextOverride);
        const cid = context.cid || this.getCid(contextOverride);
        const cacheSites = sites
            .filter(site => !!site.id)
            .map(site =>
                toDomainSiteBase({ ...(site as Record<string, unknown>), cid } as Partial<DomainSite>, {
                    cid,
                    sid: context.sid,
                    uid: context.uid,
                })
            )
            .map(site => site as SiteCache);
        await this.cacheStorage.replaceAll(cacheSites);
    }

    public async deleteSite(id: string, _contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        if (!id) return;
        await this.cacheStorage.delete(id);
    }

    public async deleteSites(ids: string[], _contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        const validIds = ids.filter(Boolean);
        if (validIds.length === 0) return;
        await this.cacheStorage.deleteAll(validIds);
    }

    public async updateSitePartial(
        id: string,
        patch: Partial<DomainSite>,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<void> {
        if (!id) return;
        const existing = await this.cacheStorage.load(id);
        if (!existing) return;
        await this.upsertSite({ ...(existing as unknown as DomainSite), ...patch }, contextOverride);
    }

    public async clearAll(_contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        await this.cacheStorage.clearAll();
    }
}
