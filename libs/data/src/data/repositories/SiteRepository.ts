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
}

/** Remote site API와 local site cache를 중재합니다. */
export class SiteRepository extends BaseRepository implements ISiteRepository {
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
        const remote = await this.requestRemote<ListResult<SiteView>>(
            ref => this.siteRemoteDataSource.fetchSite(payload, ref),
            options
        );
        await this.siteLocalDataSource.replaceSites(remote.list || [], this.getRepositoryContext());
        return remote;
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
}
