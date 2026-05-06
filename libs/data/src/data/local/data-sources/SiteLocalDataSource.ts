import type { SiteView } from '@lemoncloud/chatic-socials-api';
import type { WSSPayload } from '@lemoncloud/chatic-sockets-api';
import type { ListResult } from '../../events/types';
import type { CacheStorage, CacheStorageItem } from '../storages';
import { BaseLocalDataSource, type LocalDataSourceContextOverride } from './types';
import type { DataContextProvider } from '../../repositories';

export interface ISiteLocalDataSource {
    /** 사이트 목록을 로컬 캐시에서 조회합니다. */
    fetchSite(
        payload?: WSSPayload,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<ListResult<SiteView> | null>;
    /** 단일 사이트를 저장/병합합니다. */
    upsertSite(site: SiteView, contextOverride?: LocalDataSourceContextOverride): Promise<void>;
    /** 다수 사이트를 저장/병합합니다. */
    upsertSites(sites: SiteView[], contextOverride?: LocalDataSourceContextOverride): Promise<void>;
    /** 기존 사이트 캐시를 신규 목록으로 교체합니다. */
    replaceSites(sites: SiteView[], contextOverride?: LocalDataSourceContextOverride): Promise<void>;
    /** 단일 사이트를 삭제합니다. */
    deleteSite(id: string, contextOverride?: LocalDataSourceContextOverride): Promise<void>;
}

type SiteCache = CacheStorageItem<'site'>;

const getSiteSortValue = (site: Pick<SiteCache, 'order' | 'name' | 'id'>): string => {
    const order = site.order ?? Number.MAX_SAFE_INTEGER;
    const name = site.name ?? site.id ?? '';
    return `${String(order).padStart(10, '0')}:${name}`;
};

const normalizeSiteType = (value: SiteCache['type']): SiteView['type'] =>
    value === 'site' || value === 'user' ? value : undefined;

const toDomainSite = (site: SiteCache): SiteView => {
    const stereo = site.stereo === '' ? '' : undefined;
    const { cid: _cid, ...rest } = site;

    return {
        ...rest,
        type: normalizeSiteType(site.type),
        stereo,
    };
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
    ): Promise<ListResult<SiteView> | null> {
        // 서버 반환 정렬과 유사하게 order/name 기준 정렬로 결과를 고정합니다.
        const sites = await this.cacheStorage.loadAll();
        if (sites.length === 0) return null;

        const sorted = [...sites].sort((left, right) => getSiteSortValue(left).localeCompare(getSiteSortValue(right)));
        return {
            list: sorted.map(toDomainSite),
            total: sorted.length,
        };
    }

    public async upsertSite(site: SiteView, contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        const id = site.id;
        if (!id) return;

        const cacheItem: SiteCache = {
            ...(site as unknown as Record<string, unknown>),
            cid: this.getCid(contextOverride),
        } as SiteCache;
        await this.cacheStorage.save(id, cacheItem);
    }

    public async upsertSites(sites: SiteView[], contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        await Promise.all(sites.map(site => this.upsertSite(site, contextOverride)));
    }

    public async replaceSites(sites: SiteView[], contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        const cid = this.getCid(contextOverride);
        const cacheSites = sites
            .filter(site => !!site.id)
            .map(site => ({ ...(site as unknown as Record<string, unknown>), cid }) as SiteCache);
        await this.cacheStorage.replaceAll(cacheSites);
    }

    public async deleteSite(id: string, _contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        if (!id) return;
        await this.cacheStorage.delete(id);
    }
}
