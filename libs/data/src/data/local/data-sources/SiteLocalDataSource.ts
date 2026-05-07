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
        // 서버 반환 정렬과 유사하게 order/name 기준 정렬로 결과를 고정합니다.
        const sites = await this.cacheStorage.loadAll();
        if (sites.length === 0) return null;

        const sorted = [...sites].sort((left, right) => getSiteSortValue(left).localeCompare(getSiteSortValue(right)));
        return {
            list: sorted.map(toDomainSite),
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
        await Promise.all(sites.map(site => this.upsertSite(site, contextOverride)));
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
