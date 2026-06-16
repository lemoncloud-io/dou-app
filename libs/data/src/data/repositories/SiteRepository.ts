import type { SiteView } from '@lemoncloud/chatic-socials-api';
import type { UserMakeSitePayload, UserUpdateSitePayload, WSSPayload } from '@lemoncloud/chatic-sockets-api';
import type { ISiteLocalDataSource } from '../local/data-sources';
import type { DomainEventMap, ListResult } from '../events/types';
import type { ISiteRemoteDataSource } from '../remote/data-sources';
import type { DataContextProvider, ILocalCacheMutationRepository, LocalCacheBulkPatch } from './types';
import { BaseRepository, type RepositoryRequestOptions } from './types';
import type { IEventBus } from '../events/eventBus';
import { createDomainListResult, type DomainListResult, type DomainSite, toDomainSite } from '../domain';

/** 사이트/플레이스 도메인의 Repository 공개 계약입니다. */
export interface ISiteRepository extends ILocalCacheMutationRepository<DomainSite> {
    /** 사용자의 site 목록을 조회합니다. */
    fetchSite(payload?: WSSPayload, options?: RepositoryRequestOptions): Promise<DomainListResult<DomainSite>>;

    /** 새 site를 생성합니다. */
    createSite(payload: UserMakeSitePayload, options?: RepositoryRequestOptions): Promise<DomainSite>;

    /** 기존 site 정보를 수정합니다. */
    updateSite(payload: UserUpdateSitePayload, options?: RepositoryRequestOptions): Promise<DomainSite>;

    /** 현재 스코프의 site 로컬 캐시를 초기화합니다. */
    clearAll(): Promise<void>;

    /** 서버로부터 신규 사이트 생성(site:create) 이벤트를 수신하는 리스너를 등록합니다. */
    onSiteCreated(callback: (site: DomainSite) => void): () => void;

    /** 기존 사이트 정보 변경(site:update) 이벤트를 수신하는 리스너를 등록합니다. */
    onSiteUpdated(callback: (site: DomainSite) => void): () => void;

    // --- 통합 스트림 인터페이스 ---
    /** 로컬 캐시 기준 사이트 목록을 스트림으로 구독합니다. */
    subscribeList(
        payload: WSSPayload | undefined,
        callback: (result: DomainListResult<DomainSite> | null) => void
    ): () => void;

    /** 로컬 캐시 기준 단일 사이트를 스트림으로 구독합니다. */
    subscribeItem(id: string, callback: (site: DomainSite | null) => void): () => void;
}

/** Remote site API와 local site cache를 중재합니다. */
export class SiteRepository extends BaseRepository implements ISiteRepository {
    constructor(
        private readonly siteRemoteDataSource: ISiteRemoteDataSource,
        private readonly siteLocalDataSource: ISiteLocalDataSource,
        contextProvider: DataContextProvider,
        domainEventBus: IEventBus<DomainEventMap>
    ) {
        super(contextProvider, domainEventBus);
        this.initializeInternalListeners();
    }

    public async fetchSite(
        payload?: WSSPayload,
        options?: RepositoryRequestOptions
    ): Promise<DomainListResult<DomainSite>> {
        return this.fetchWithCachePolicy<DomainListResult<DomainSite>>({
            options,
            backgroundLabel: 'site',
            fetchLocal: () => this.siteLocalDataSource.fetchList(payload, this.getRepositoryContext()),
            fetchRemote: remoteOptions => this.fetchFromRemoteAndCache(payload, remoteOptions),
            isLocalValid: local => (local.list || []).length > 0,
            fallback: () => createDomainListResult([], { total: 0, source: 'fallback' }),
        });
    }

    public async createSite(payload: UserMakeSitePayload, options?: RepositoryRequestOptions): Promise<DomainSite> {
        const site = (await this.siteRemoteDataSource.createSite(payload)) as SiteView;
        const domainSite = toDomainSite(site, this.getDomainScope());
        await this.siteLocalDataSource.upsert(domainSite, this.getRepositoryContext());
        return domainSite;
    }

    public async updateSite(payload: UserUpdateSitePayload, options?: RepositoryRequestOptions): Promise<DomainSite> {
        const site = (await this.siteRemoteDataSource.updateSite(payload)) as SiteView;
        const domainSite = toDomainSite(site, this.getDomainScope());
        await this.siteLocalDataSource.upsert(domainSite, this.getRepositoryContext());
        return domainSite;
    }

    public clearAll(): Promise<void> {
        return this.siteLocalDataSource.clearAll(this.getRepositoryContext());
    }

    public onSiteCreated(callback: (site: DomainSite) => void): () => void {
        return this.onDomainEvent('site:create', detail => {
            callback(detail.data as DomainSite);
        });
    }

    public onSiteUpdated(callback: (site: DomainSite) => void): () => void {
        return this.onDomainEvent('site:update', detail => {
            callback(detail.data as DomainSite);
        });
    }

    // --- 스트림 인터페이스 통합 ---
    public subscribeList(
        payload: WSSPayload | undefined,
        callback: (result: DomainListResult<DomainSite> | null) => void
    ): () => void {
        return this.siteLocalDataSource.subscribeList(payload, callback, this.getRepositoryContext());
    }

    public subscribeItem(id: string, callback: (site: DomainSite | null) => void): () => void {
        return this.siteLocalDataSource.subscribeItem(id, callback, this.getRepositoryContext());
    }

    // --- Cache Mutations (통합) ---
    public cacheCreate(item: Partial<DomainSite>): Promise<void> {
        return this.siteLocalDataSource.upsert(item, this.getRepositoryContext());
    }

    public cacheUpdate(id: string, patch: Partial<DomainSite>): Promise<void> {
        return this.siteLocalDataSource.upsert({ id, ...patch }, this.getRepositoryContext());
    }

    public cacheDelete(id: string): Promise<void> {
        return this.siteLocalDataSource.remove(id, this.getRepositoryContext());
    }

    public cacheBulkCreate(items: Array<Partial<DomainSite>>): Promise<void> {
        return this.siteLocalDataSource.upsertMany(items, this.getRepositoryContext());
    }

    public async cacheBulkUpdate(items: Array<LocalCacheBulkPatch<DomainSite>>): Promise<void> {
        await Promise.all(
            items
                .filter(item => !!item.id)
                .map(item =>
                    this.siteLocalDataSource.upsert({ id: item.id, ...item.patch }, this.getRepositoryContext())
                )
        );
    }

    private async fetchFromRemoteAndCache(
        payload?: WSSPayload,
        options?: RepositoryRequestOptions
    ): Promise<DomainListResult<DomainSite>> {
        // 요청 시점의 context를 캡처 — await 중 cloud 전환이 발생해도 올바른 scope에 캐시 저장
        const requestScope = this.getDomainScope();
        const requestContext = this.getRepositoryContext();

        const remote = (await this.siteRemoteDataSource.fetchSite(payload)) as ListResult<SiteView>;
        // 서버 응답의 cid(e.g. "global")는 cloud 파티셔닝 기준과 다를 수 있으므로
        // requestScope.cid(= 요청 시점의 cloudId)로 강제 대체
        // 서버 응답의 배열 순서를 order 필드로 보존 — 로컬 캐시에서 읽을 때도 동일 순서 유지
        const domainList = (remote.list || []).map((item, index) => ({
            ...toDomainSite(item, requestScope),
            cid: requestScope.cid,
            order: index,
        }));

        // cloud가 전환되었으면 캐시 저장 스킵 — cross-cloud 오염 방지
        const currentCid = this.getRepositoryContext().cid;
        if (currentCid === requestContext.cid) {
            await this.siteLocalDataSource.upsertMany(domainList, requestContext);
        }

        return createDomainListResult(domainList, {
            total: remote.total ?? domainList.length,
            limit: remote.limit,
            page: remote.page,
            source: 'remote',
        });
    }

    private initializeInternalListeners(): void {
        this.onDomainEvent('site:create', detail => {
            this.runInBackground(
                () => this.siteLocalDataSource.upsert(detail.data, this.getRepositoryContext()),
                'site:create'
            );
        });
        this.onDomainEvent('site:update', detail => {
            this.runInBackground(
                () => this.siteLocalDataSource.upsert(detail.data, this.getRepositoryContext()),
                'site:update'
            );
        });
    }
}
