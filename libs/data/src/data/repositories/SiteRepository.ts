import type { SiteView } from '@lemoncloud/chatic-socials-api';
import type { UserMakeSitePayload, UserUpdateSitePayload, WSSPayload } from '@lemoncloud/chatic-sockets-api';
import type { ISiteLocalDataSource } from '../local/data-sources';
import type { DomainEventMap, ListResult } from '../events/types';
import type { ISiteRemoteDataSource } from '../remote/data-sources';
import type { ISocketRequestManager } from '../remote/sockets/SocketRequestManager';
import type { DataContextProvider } from './types';
import { BaseRepository, type RepositoryRequestOptions } from './types';
import type { IEventBus } from '../events/eventBus';

/** 사이트/플레이스 도메인의 Repository 공개 계약입니다. */
export interface ISiteRepository {
    /** 사용자의 site 목록을 조회합니다. */
    fetchSite(payload?: WSSPayload, options?: RepositoryRequestOptions): Promise<ListResult<SiteView>>;

    /** 새 site를 생성합니다. */
    createSite(payload: UserMakeSitePayload, options?: RepositoryRequestOptions): Promise<SiteView>;

    /** 기존 site 정보를 수정합니다. */
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
    public async fetchSite(payload?: WSSPayload, options?: RepositoryRequestOptions): Promise<ListResult<SiteView>> {
        const policy = this.resolveCachePolicy(options);
        if (policy === 'network-only') {
            return this.fetchFromRemoteAndCache(payload, options);
        }

        const local = await this.siteLocalDataSource.fetchSite(payload, this.getRepositoryContext());
        if (policy === 'cache-only') {
            return local ?? { list: [], total: 0 };
        }

        if (local) {
            this.runInBackground(
                () => this.fetchFromRemoteAndCache(payload, { ...options, cachePolicy: 'network-only' }),
                'site:cache-and-network-refresh'
            );
            return local;
        }

        return this.fetchFromRemoteAndCache(payload, options);
    }

    /** user:make-site 요청을 수행하고 응답을 기다립니다. */
    public async createSite(payload: UserMakeSitePayload, options?: RepositoryRequestOptions): Promise<SiteView> {
        const site = await this.requestRemote<SiteView>(
            ref => this.siteRemoteDataSource.createSite(payload, ref),
            options
        );
        await this.siteLocalDataSource.upsertSite(site, this.getRepositoryContext());
        return site;
    }

    /** user:update-site 요청을 수행하고 응답을 기다립니다. */
    public async updateSite(payload: UserUpdateSitePayload, options?: RepositoryRequestOptions): Promise<SiteView> {
        const site = await this.requestRemote<SiteView>(
            ref => this.siteRemoteDataSource.updateSite(payload, ref),
            options
        );
        await this.siteLocalDataSource.upsertSite(site, this.getRepositoryContext());
        return site;
    }

    private resolveCachePolicy(
        options?: RepositoryRequestOptions
    ): NonNullable<RepositoryRequestOptions['cachePolicy']> {
        if (options?.cachePolicy) return options.cachePolicy;
        return 'cache-and-network';
    }

    private async fetchFromRemoteAndCache(
        payload?: WSSPayload,
        options?: RepositoryRequestOptions
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
