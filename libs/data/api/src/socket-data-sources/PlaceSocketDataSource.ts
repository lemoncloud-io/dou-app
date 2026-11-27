import type { PlaceSocketDomainGateway } from '../gateways';
import type { UserMySiteInput } from '@lemoncloud/chatic-sockets-api';
import type { MySiteView } from '@lemoncloud/chatic-backend-api';
import type { ListResult } from '@lemoncloud/chatic-backend-api/dist/cores/types';
import type { PlaceLeaveResult } from '@lemoncloud/chatic-sockets-api/dist/lib/place/types';
import type { DomainListResult, DomainPlace } from '@chatic/data-model';
import { createDomainListResult, toDomainPlace } from '@chatic/data-model';
import type { DataContext } from '@chatic/data-model';

export type PlaceCreateInput = Parameters<PlaceSocketDomainGateway['create']>[0];
export type PlaceUpdateInput = Parameters<PlaceSocketDomainGateway['update']>[0];
export type PlaceDeleteInput = Parameters<PlaceSocketDomainGateway['delete']>[0];
export type PlaceLeaveInput = Parameters<PlaceSocketDomainGateway['leave']>[0];
export type { PlaceLeaveResult };

export interface IPlaceSocketDataSource {
    fetchPlace(payload: UserMySiteInput | undefined, context: DataContext): Promise<DomainListResult<DomainPlace>>;
    createPlace(payload: PlaceCreateInput, context: DataContext): Promise<DomainPlace>;
    updatePlace(payload: PlaceUpdateInput, context: DataContext): Promise<DomainPlace>;
    deletePlace(payload: PlaceDeleteInput): Promise<void>;
    leavePlace(payload: PlaceLeaveInput): Promise<PlaceLeaveResult>;
    getPlace(id: string, context: DataContext): Promise<DomainPlace>;
}

export class PlaceSocketDataSource implements IPlaceSocketDataSource {
    constructor(private readonly gateway: PlaceSocketDomainGateway) {}

    public async fetchPlace(
        payload: UserMySiteInput | undefined,
        context: DataContext
    ): Promise<DomainListResult<DomainPlace>> {
        const remote = await this.gateway.mySite<ListResult<MySiteView>>(payload ?? null);
        const list = (remote?.list || []).map(item => toDomainPlace(item, context));
        return createDomainListResult(list, {
            total: remote?.total ?? list.length,
            source: 'remote',
        });
    }

    public async createPlace(payload: PlaceCreateInput, context: DataContext): Promise<DomainPlace> {
        const remote = await this.gateway.create<MySiteView & { site$?: MySiteView }>(payload);
        const { site$, ...profile } = remote || {};
        return toDomainPlace({ ...profile, ...site$ } as MySiteView, context);
    }

    public async updatePlace(payload: PlaceUpdateInput, context: DataContext): Promise<DomainPlace> {
        const remote = await this.gateway.update<MySiteView>(payload);
        return toDomainPlace((remote || {}) as MySiteView, context);
    }

    public async deletePlace(payload: PlaceDeleteInput): Promise<void> {
        await this.gateway.delete(payload);
    }

    public async leavePlace(payload: PlaceLeaveInput): Promise<PlaceLeaveResult> {
        return this.gateway.leave<PlaceLeaveResult>(payload);
    }

    public async getPlace(id: string, context: DataContext): Promise<DomainPlace> {
        const remote = await this.gateway.get<MySiteView>({ id });
        return toDomainPlace((remote || {}) as MySiteView, context);
    }
}
