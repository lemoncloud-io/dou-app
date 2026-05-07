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
        IStreamLocalDataSource<DomainSite, WSSPayload | undefined, DomainListResult<DomainSite>> {
    /** 사이트 목록을 로컬 캐시에서 조회합니다. */
    fetchSite(
        payload?: WSSPayload,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<DomainListResult<DomainSite> | null>;
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

    /** 사이트 목록 조회 결과를 스트림으로 구독합니다. */
    subscribeSites(
        payload: WSSPayload | undefined,
        callback: LocalStreamCallback<DomainListResult<DomainSite> | null>,
        contextOverride?: LocalDataSourceContextOverride
    ): LocalStreamUnsubscribe;

    /** 단일 사이트 조회 결과를 스트림으로 구독합니다. */
    subscribeSite(
        id: string,
        callback: LocalStreamCallback<DomainSite | null>,
        contextOverride?: LocalDataSourceContextOverride
    ): LocalStreamUnsubscribe;
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
    ): Promise<DomainListResult<DomainSite> | null> {
        const sites = await this.cacheStorage.loadAll();
        if (sites.length === 0) return null;

        const domainSites = sites.map(toDomainSite);
        const sorted = domainSites.sort((left, right) => getSiteSortValue(left).localeCompare(getSiteSortValue(right)));

        return createDomainListResult(
            {
                list: sorted,
                total: sorted.length,
            },
            { source: 'local' }
        );
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
        await this.emitAllStreams();
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
            await this.emitAllStreams();
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
        await this.emitAllStreams();
    }

    public async deleteSite(id: string, _contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        if (!id) return;
        await this.cacheStorage.delete(id);
        await this.emitAllStreams();
    }

    public async deleteSites(ids: string[], _contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        const validIds = ids.filter(Boolean);
        if (validIds.length === 0) return;
        await this.cacheStorage.deleteAll(validIds);
        await this.emitAllStreams();
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
        await this.emitAllStreams();
    }

    /** 로컬 사이트 목록 스냅샷을 지속 구독합니다. */
    public subscribeSites(
        payload: WSSPayload | undefined,
        callback: LocalStreamCallback<DomainListResult<DomainSite> | null>,
        contextOverride?: LocalDataSourceContextOverride
    ): LocalStreamUnsubscribe {
        return this.subscribeQueryStream(() => this.fetchSite(payload, contextOverride), callback);
    }

    /** 로컬 단일 사이트 스냅샷을 지속 구독합니다. */
    public subscribeSite(
        id: string,
        callback: LocalStreamCallback<DomainSite | null>,
        contextOverride?: LocalDataSourceContextOverride
    ): LocalStreamUnsubscribe {
        return this.subscribeQueryStream(async () => {
            if (!id) return null;
            const item = await this.cacheStorage.load(id);
            return item ? toDomainSite(item) : null;
        }, callback);
    }

    /** 공통 CRUD 인터페이스: 리스트 조회 */
    public fetchList(
        query: WSSPayload | undefined,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<DomainListResult<DomainSite> | null> {
        return this.fetchSite(query, contextOverride);
    }

    /** 공통 CRUD 인터페이스: 단건 조회 */
    public async getById(id: string, _contextOverride?: LocalDataSourceContextOverride): Promise<DomainSite | null> {
        if (!id) return null;
        const item = await this.cacheStorage.load(id);
        return item ? toDomainSite(item) : null;
    }

    /** 공통 CRUD 인터페이스: 단건 저장 */
    public upsert(item: Partial<DomainSite>, contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        return this.upsertSite(item, contextOverride);
    }

    /** 공통 CRUD 인터페이스: 다건 저장 */
    public upsertMany(
        items: Array<Partial<DomainSite>>,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<void> {
        return this.upsertSites(items, contextOverride);
    }

    /** 공통 CRUD 인터페이스: 단건 삭제 */
    public remove(id: string, contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        return this.deleteSite(id, contextOverride);
    }

    /** 공통 CRUD 인터페이스: 다건 삭제 */
    public removeMany(ids: string[], contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        return this.deleteSites(ids, contextOverride);
    }

    /** 공통 Stream 인터페이스: 리스트 구독 */
    public subscribeList(
        query: WSSPayload | undefined,
        callback: LocalStreamCallback<DomainListResult<DomainSite> | null>,
        contextOverride?: LocalDataSourceContextOverride
    ): LocalStreamUnsubscribe {
        return this.subscribeSites(query, callback, contextOverride);
    }

    /** 공통 Stream 인터페이스: 단건 구독 */
    public subscribeItem(
        id: string,
        callback: LocalStreamCallback<DomainSite | null>,
        contextOverride?: LocalDataSourceContextOverride
    ): LocalStreamUnsubscribe {
        return this.subscribeSite(id, callback, contextOverride);
    }
}
