import type { PlaceGateway } from '@lemoncloud/chatic-sockets-lib';
import type { IEventBus } from '../../events/eventBus';
import type { DomainEventMap } from '../../events/domain';
import type { PlaceDomainGateway } from '../gateways';
import type { UserMySiteInput } from '@lemoncloud/chatic-sockets-api';
import type { MySiteView } from '@lemoncloud/chatic-backend-api';
import type { ListResult } from '@lemoncloud/chatic-socials-api/dist/cores/types';

// Place CRUD inputs are derived from the gateway so we don't depend on deep sockets-lib paths.
export type PlaceCreateInput = Parameters<PlaceGateway['create']>[0];
export type PlaceGetInput = Parameters<PlaceGateway['get']>[0];
export type PlaceUpdateInput = Parameters<PlaceGateway['update']>[0];
export type PlaceDeleteInput = Parameters<PlaceGateway['delete']>[0];

export interface IPlaceRemoteDataSource {
    /** 사용자가 접근 가능한 place(=site) 목록을 요청합니다. */
    fetchPlace(payload?: UserMySiteInput): Promise<ListResult<MySiteView>>;
    /** 새 place 생성을 요청합니다. */
    createPlace(payload: PlaceCreateInput): Promise<MySiteView>;
    /** place 단건 조회를 요청합니다. */
    getPlace(payload: PlaceGetInput): Promise<MySiteView>;
    /** place 정보 수정을 요청합니다. */
    updatePlace(payload: PlaceUpdateInput): Promise<MySiteView>;
    /** place 삭제를 요청합니다. */
    deletePlace(payload: PlaceDeleteInput): Promise<MySiteView>;
    /** 인바운드 모델 이벤트를 처리합니다. */
    handleModelEvent(action: 'create' | 'update' | 'delete', data: any): void;
}

export class PlaceRemoteDataSource implements IPlaceRemoteDataSource {
    constructor(
        private readonly domainEventBus: IEventBus<DomainEventMap>,
        private readonly gateway: PlaceDomainGateway
    ) {}

    public async fetchPlace(payload?: UserMySiteInput): Promise<ListResult<MySiteView>> {
        return this.gateway.mySite(payload ?? null);
    }

    public async createPlace(payload: PlaceCreateInput): Promise<MySiteView> {
        return this.gateway.create(payload);
    }

    public async getPlace(payload: PlaceGetInput): Promise<MySiteView> {
        return this.gateway.get(payload);
    }

    public async updatePlace(payload: PlaceUpdateInput): Promise<MySiteView> {
        return this.gateway.update(payload);
    }

    public async deletePlace(payload: PlaceDeleteInput): Promise<MySiteView> {
        return this.gateway.delete(payload);
    }

    public handleModelEvent(action: 'create' | 'update' | 'delete', data: any): void {
        if (action === 'delete') return; // place delete is not in DomainEventMap, but keep it safe
        const eventName = `place:${action}` as 'place:create' | 'place:update';
        this.domainEventBus.emit(eventName, {
            data,
        });
    }
}
