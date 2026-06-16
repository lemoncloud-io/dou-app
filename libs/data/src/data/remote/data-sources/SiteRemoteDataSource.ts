import type { IEventBus } from '../../events/eventBus';
import type { DomainEventMap } from '../../events/domain';
import type { ISocketClient } from '../sockets/clients/clients';
import type { UserMySiteInput, UserMakeSiteInput, UserUpdateSiteInput } from '@lemoncloud/chatic-sockets-api';

export interface ISiteRemoteDataSource {
    /** 사용자가 접근 가능한 사이트 목록을 요청합니다. */
    fetchSite(payload?: UserMySiteInput): Promise<unknown>;
    /** 새 사이트 생성을 요청합니다. */
    createSite(payload: UserMakeSiteInput): Promise<unknown>;
    /** 사이트 정보 수정을 요청합니다. */
    updateSite(payload: UserUpdateSiteInput): Promise<unknown>;
    /** 인바운드 모델 이벤트를 처리합니다. */
    handleModelEvent(action: 'create' | 'update' | 'delete', data: any): void;
}

export class SiteRemoteDataSource implements ISiteRemoteDataSource {
    constructor(
        private readonly domainEventBus: IEventBus<DomainEventMap>,
        private readonly client: ISocketClient
    ) {}

    public async fetchSite(payload?: UserMySiteInput): Promise<unknown> {
        return this.client.request('user.my-site', payload ?? {});
    }

    public async createSite(payload: UserMakeSiteInput): Promise<unknown> {
        return this.client.request('user.make-site', payload);
    }

    public async updateSite(payload: UserUpdateSiteInput): Promise<unknown> {
        return this.client.request('user.update-site', payload);
    }

    public handleModelEvent(action: 'create' | 'update' | 'delete', data: any): void {
        if (action === 'delete') return; // site delete is not in DomainEventMap, but keep it safe
        const eventName = `site:${action}` as 'site:create' | 'site:update';
        this.domainEventBus.emit(eventName, {
            data,
        });
    }
}
