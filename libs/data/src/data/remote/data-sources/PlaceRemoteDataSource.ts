import type { PlaceDomainGateway } from '../gateways';
import type { UserMySiteInput } from '@lemoncloud/chatic-sockets-api';
import type { MySiteView } from '@lemoncloud/chatic-backend-api';
import type { ListResult } from '@lemoncloud/chatic-socials-api/dist/cores/types';

export type PlaceCreateInput = Parameters<PlaceDomainGateway['create']>[0];
export type PlaceGetInput = Parameters<PlaceDomainGateway['get']>[0];
export type PlaceUpdateInput = Parameters<PlaceDomainGateway['update']>[0];
export type PlaceDeleteInput = Parameters<PlaceDomainGateway['delete']>[0];

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
}

export class PlaceRemoteDataSource implements IPlaceRemoteDataSource {
    constructor(private readonly gateway: PlaceDomainGateway) {}

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
}
