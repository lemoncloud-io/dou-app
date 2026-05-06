import type { SiteView } from '@lemoncloud/chatic-socials-api';
import type { UserMakeSitePayload, UserUpdateSitePayload, WSSPayload } from '@lemoncloud/chatic-sockets-api';
import type { ISiteLocalDataSource } from '../local/data-sources';
import type { DomainEventMap, ListResult } from '../events/types';
import type { ISiteRemoteDataSource } from '../remote/data-sources';
import type { ISocketRequestManager } from '../remote/sockets/SocketRequestManager';
import { BaseRepository, type RepositoryContextProvider, type RepositoryRequestOptions } from './types';
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
        context: RepositoryContextProvider,
        domainEventBus: IEventBus<DomainEventMap>
    ) {
        super(requestManager, context, domainEventBus);
    }

    /** user:my-site 요청을 수행하고 응답을 기다립니다. */
    public fetchSite(payload?: WSSPayload, options?: RepositoryRequestOptions): Promise<ListResult<SiteView>> {
        return this.requestRemote(ref => this.siteRemoteDataSource.fetchSite(payload, ref), options);
    }

    /** user:make-site 요청을 수행하고 응답을 기다립니다. */
    public createSite(payload: UserMakeSitePayload, options?: RepositoryRequestOptions): Promise<SiteView> {
        return this.requestRemote(ref => this.siteRemoteDataSource.createSite(payload, ref), options);
    }

    /** user:update-site 요청을 수행하고 응답을 기다립니다. */
    public updateSite(payload: UserUpdateSitePayload, options?: RepositoryRequestOptions): Promise<SiteView> {
        return this.requestRemote(ref => this.siteRemoteDataSource.updateSite(payload, ref), options);
    }
}
