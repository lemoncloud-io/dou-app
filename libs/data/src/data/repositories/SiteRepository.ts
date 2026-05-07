import type { SiteView } from '@lemoncloud/chatic-socials-api';
import type { UserMakeSitePayload, UserUpdateSitePayload, WSSPayload } from '@lemoncloud/chatic-sockets-api';
import type { ISiteLocalDataSource } from '../local/data-sources';
import type { DomainEventMap, ListResult } from '../events/types';
import type { ISiteRemoteDataSource } from '../remote/data-sources';
import type { ISocketRequestManager } from '../remote/sockets/SocketRequestManager';
import type { DataContextProvider } from './types';
import { BaseRepository, type RepositoryRequestOptions } from './types';
import type { IEventBus } from '../events/eventBus';
import type { DomainListResult, DomainSite } from '../domain';
import { toDomainSite } from '../domain';

/** 사이트/플레이스 도메인의 Repository 공개 계약입니다. */
export interface ISiteRepository {
    /** 사용자의 site 목록을 조회합니다. */
    fetchSite(payload?: WSSPayload, options?: RepositoryRequestOptions): Promise<DomainListResult<DomainSite>>;

    /** 새 site를 생성합니다. */
    createSite(payload: UserMakeSitePayload, options?: RepositoryRequestOptions): Promise<DomainSite>;

    /** 기존 site 정보를 수정합니다. */
    updateSite(payload: UserUpdateSitePayload, options?: RepositoryRequestOptions): Promise<DomainSite>;
    updateSite(payload: UserUpdateSitePayload, options?: RepositoryRequestOptions): Promise<SiteView>;

    /** 서버로부터 site 생성(site:create) 이벤트를 수신하는 리스너를 등록합니다. */
    onSiteCreated(callback: (site: SiteView) => void): () => void;
    /** 서버로부터 site 변경(site:update) 이벤트를 수신하는 리스너를 등록합니다. */
    onSiteUpdated(callback: (site: SiteView) => void): () => void;
}

/** Remote site API와 local site cache를 중재합니다. */
export class SiteRepository extends BaseRepository implements ISiteRepository {
    /** 동시 다발적 fetchSite 호출을 하나의 WebSocket 요청으로 합치기 위한 inflight Promise */
    private inflightFetchSite: Promise<ListResult<SiteView>> | null = null;

    constructor(
        private readonly siteRemoteDataSource: ISiteRemoteDataSource,
        private readonly siteLocalDataSource: ISiteLocalDataSource,
        requestManager: ISocketRequestManager,
        contextProvider: DataContextProvider,
        domainEventBus: IEventBus<DomainEventMap>
    ) {
        super(requestManager, contextProvider, domainEventBus);
        this.initializeInternalListeners();
    }

    /** user:my-site 요청을 수행하고 응답을 기다립니다. */
    public async fetchSite(
        payload?: WSSPayload,
        options?: RepositoryRequestOptions
    ): Promise<DomainListResult<DomainSite>> {
        return this.fetchWithCachePolicy<DomainListResult<DomainSite>>({
            options,
            backgroundLabel: 'site',
            fetchLocal: () => this.siteLocalDataSource.fetchSite(payload, this.getRepositoryContext()),
            fetchRemote: remoteOptions => this.fetchFromRemoteAndCache(payload, remoteOptions),
            fallback: () => ({ list: [], total: 0 }),
        });
    }

    /** user:make-site 요청을 수행하고 응답을 기다립니다. */
    public async createSite(payload: UserMakeSitePayload, options?: RepositoryRequestOptions): Promise<DomainSite> {
        const site = await this.requestRemote<DomainSite>(
            ref => this.siteRemoteDataSource.createSite(payload, ref),
            options
        );
        const domainSite = toDomainSite(site, this.getDomainScope());
        await this.siteLocalDataSource.upsertSite(domainSite, this.getRepositoryContext());
        return domainSite;
    }

    /** user:update-site 요청을 수행하고 응답을 기다립니다. */
    public async updateSite(payload: UserUpdateSitePayload, options?: RepositoryRequestOptions): Promise<DomainSite> {
        const site = await this.requestRemote<DomainSite>(
            ref => this.siteRemoteDataSource.updateSite(payload, ref),
            options
        );
        const domainSite = toDomainSite(site, this.getDomainScope());
        await this.siteLocalDataSource.upsertSite(domainSite, this.getRepositoryContext());
        return domainSite;
    }

    private async fetchFromRemoteAndCache(
        payload?: WSSPayload,
        options?: RepositoryRequestOptions
    ): Promise<DomainListResult<DomainSite>> {
        const remote = await this.requestRemote<ListResult<DomainSite>>(
            ref => this.siteRemoteDataSource.fetchSite(payload, ref),
            options
        );
        const domainList = (remote.list || []).map(item => toDomainSite(item, this.getDomainScope()));
        await this.siteLocalDataSource.replaceSites(domainList, this.getRepositoryContext());
        return { ...remote, list: domainList };
    ): Promise<ListResult<SiteView>> {
        if (this.inflightFetchSite) return this.inflightFetchSite;

        this.inflightFetchSite = (async () => {
            try {
                const remote = await this.requestRemote<ListResult<SiteView>>(
                    ref => this.siteRemoteDataSource.fetchSite(payload, ref),
                    options
                );
                await this.siteLocalDataSource.replaceSites(remote.list || [], this.getRepositoryContext());
                return remote;
            } finally {
                this.inflightFetchSite = null;
            }
        })();

        return this.inflightFetchSite;
    }

    private initializeInternalListeners(): void {
        this.onDomainEvent('site:create', detail => {
            this.runInBackground(
                () => this.siteLocalDataSource.upsertSite(detail.data, this.getRepositoryContext()),
                'site:create'
            );
        });
        this.onDomainEvent('site:update', detail => {
            this.runInBackground(
                () => this.siteLocalDataSource.upsertSite(detail.data, this.getRepositoryContext()),
                'site:update'
            );
        });
        this.onDomainEvent('site:list', detail => {
            this.runInBackground(
                () => this.siteLocalDataSource.replaceSites(detail.data.list || [], this.getRepositoryContext()),
                'site:list'
            );
        });
    }

    /** 서버로부터 site 생성(site:create) 이벤트를 수신하는 리스너를 등록합니다. */
    public onSiteCreated(callback: (site: SiteView) => void): () => void {
        return this.onDomainEvent('site:create', data => {
            callback(data.data);
        });
    }

    /** 서버로부터 site 변경(site:update) 이벤트를 수신하는 리스너를 등록합니다. */
    public onSiteUpdated(callback: (site: SiteView) => void): () => void {
        return this.onDomainEvent('site:update', data => {
            callback(data.data);
        });
    }
}
