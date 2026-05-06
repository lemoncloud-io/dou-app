import type { SiteView } from '@lemoncloud/chatic-socials-api';
import type { UserMakeSitePayload, UserUpdateSitePayload, WSSPayload } from '@lemoncloud/chatic-sockets-api';
import type { ListResult } from '../events/types';
import type { ISiteRemoteDataSource } from '../remote/data-sources';
import type { ISocketRequestManager } from '../remote/sockets/SocketRequestManager';
import {
    BaseRepository,
    type RepositoryContextProvider,
    type RepositoryDomainEventBus,
    type RepositoryRequestOptions,
} from './types';

/**
 * 사이트/플레이스 도메인의 Repository 공개 계약입니다.
 * 사용자가 접근 가능한 site 목록과 site 생성/수정을 담당합니다.
 */
export interface ISiteRepository {
    /** 사용자의 site 목록을 조회합니다. */
    fetchSite(payload?: WSSPayload, options?: RepositoryRequestOptions): Promise<ListResult<SiteView>>;
    /** 새 site를 생성합니다. */
    createSite(payload: UserMakeSitePayload, options?: RepositoryRequestOptions): Promise<SiteView>;
    /** 기존 site 정보를 수정합니다. */
    updateSite(payload: UserUpdateSitePayload, options?: RepositoryRequestOptions): Promise<SiteView>;
}

/**
 * SiteRemoteDataSource를 감싸는 site Repository 구현체입니다.
 */
export class SiteRepository extends BaseRepository implements ISiteRepository {
    constructor(
        private readonly siteDataSource: ISiteRemoteDataSource,
        requestManager: ISocketRequestManager,
        context?: RepositoryContextProvider,
        domainEventBus?: RepositoryDomainEventBus
    ) {
        super(requestManager, context, domainEventBus);
    }

    /** user:my-site 요청을 수행하고 응답을 기다립니다. */
    public fetchSite(payload?: WSSPayload, options?: RepositoryRequestOptions): Promise<ListResult<SiteView>> {
        return this.requestRemote(ref => this.siteDataSource.fetchSite(payload, ref), options);
    }

    /** user:make-site 요청을 수행하고 응답을 기다립니다. */
    public createSite(payload: UserMakeSitePayload, options?: RepositoryRequestOptions): Promise<SiteView> {
        return this.requestRemote(ref => this.siteDataSource.createSite(payload, ref), options);
    }

    /** user:update-site 요청을 수행하고 응답을 기다립니다. */
    public updateSite(payload: UserUpdateSitePayload, options?: RepositoryRequestOptions): Promise<SiteView> {
        return this.requestRemote(ref => this.siteDataSource.updateSite(payload, ref), options);
    }
}
