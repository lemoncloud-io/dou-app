import type { IEventBus } from '../../events/eventBus';
import type { DomainEventMap } from '../../events/domain';
import type { SiteGateway } from '../gateways';
import type { UserMakeSiteInput, UserMySiteInput, UserUpdateSiteInput } from '@lemoncloud/chatic-sockets-api';
import type { MySiteView } from '@lemoncloud/chatic-backend-api';
import type { ListResult } from '@lemoncloud/chatic-socials-api/dist/cores/types';

export interface ISiteRemoteDataSource {
    /** 사용자가 접근 가능한 사이트 목록을 요청합니다. */
    fetchSite(payload?: UserMySiteInput): Promise<ListResult<MySiteView>>;
    /** 새 사이트 생성을 요청합니다. */
    createSite(payload: UserMakeSiteInput): Promise<MySiteView>;
    /** 사이트 정보 수정을 요청합니다. */
    updateSite(payload: UserUpdateSiteInput): Promise<MySiteView>;
    /** 인바운드 모델 이벤트를 처리합니다. */
    handleModelEvent(action: 'create' | 'update' | 'delete', data: any): void;
}

export class SiteRemoteDataSource implements ISiteRemoteDataSource {
    constructor(
        private readonly domainEventBus: IEventBus<DomainEventMap>,
        private readonly gateway: SiteGateway
    ) {}

    public async fetchSite(payload?: UserMySiteInput): Promise<ListResult<MySiteView>> {
        return this.gateway.mySite(payload ?? null);
    }

    public async createSite(payload: UserMakeSiteInput): Promise<MySiteView> {
        return this.gateway.makeSite(payload);
    }

    public async updateSite(payload: UserUpdateSiteInput): Promise<MySiteView> {
        return this.gateway.updateSite(payload);
    }

    public handleModelEvent(action: 'create' | 'update' | 'delete', data: any): void {
        if (action === 'delete') return; // site delete is not in DomainEventMap, but keep it safe
        const eventName = `site:${action}` as 'site:create' | 'site:update';
        this.domainEventBus.emit(eventName, {
            data,
        });
    }
}
