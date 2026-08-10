import type { PlaceDomainGateway } from '../gateways';
import type { UserMySiteInput } from '@lemoncloud/chatic-sockets-api';
import type { MySiteView } from '@lemoncloud/chatic-backend-api';
import type { ListResult } from '@lemoncloud/chatic-socials-api/dist/cores/types';
import type { DomainListResult, DomainPlace } from '../../domain';
import { createDomainListResult, toDomainPlace } from '../../domain';
import type { DataContext } from '../../repositories-v2/types';

export type PlaceCreateInput = Parameters<PlaceDomainGateway['create']>[0];
export type PlaceGetInput = Parameters<PlaceDomainGateway['get']>[0];
export type PlaceUpdateInput = Parameters<PlaceDomainGateway['update']>[0];
export type PlaceDeleteInput = Parameters<PlaceDomainGateway['delete']>[0];

export interface IPlaceRemoteDataSource {
    /** 사용자가 접근 가능한 place(=site) 목록을 요청하고 도메인 모델로 반환합니다. */
    fetchPlace(payload: UserMySiteInput | undefined, context: DataContext): Promise<DomainListResult<DomainPlace>>;
    /** 새 place 생성을 요청합니다. */
    createPlace(payload: PlaceCreateInput, context: DataContext): Promise<DomainPlace>;
    /** place 단건 조회를 요청합니다. */
    getPlace(payload: PlaceGetInput, context: DataContext): Promise<DomainPlace>;
    /** place 정보 수정을 요청합니다. */
    updatePlace(payload: PlaceUpdateInput, context: DataContext): Promise<DomainPlace>;
    /** place 삭제를 요청합니다. */
    deletePlace(payload: PlaceDeleteInput, context: DataContext): Promise<DomainPlace>;
}

/**
 * Place remote source. Single boundary where place (site) API views become
 * domain models; callers receive domain shapes only. The request-time
 * `context` is supplied by the caller to keep a late response on its scope.
 */
export class PlaceRemoteDataSource implements IPlaceRemoteDataSource {
    constructor(private readonly gateway: PlaceDomainGateway) {}

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
        // Unlike get/update/delete, `place.create` answers with the new OWNER PROFILE, not the site
        // itself — its top-level `id` is the profile's (uid-scoped), while the actual created site
        // rides along embedded as `site$`. Spreading `site$` over the profile fields corrects `id`
        // (and any other site-owned field) without losing profile-only extras (e.g. `thumbnail`).
        // Using the profile's `id` here would cache a place row under the wrong key, so every later
        // lookup (place.get, switchSite, ...) 404s against a site that was never created.
        const remote = await this.gateway.create<MySiteView & { site$?: MySiteView }>(payload);
        const { site$, ...profile } = remote || {};
        return toDomainPlace({ ...profile, ...site$ } as MySiteView, context);
    }

    public async getPlace(payload: PlaceGetInput, context: DataContext): Promise<DomainPlace> {
        const remote = await this.gateway.get<MySiteView>(payload);
        return toDomainPlace((remote || {}) as MySiteView, context);
    }

    public async updatePlace(payload: PlaceUpdateInput, context: DataContext): Promise<DomainPlace> {
        const remote = await this.gateway.update<MySiteView>(payload);
        return toDomainPlace((remote || {}) as MySiteView, context);
    }

    public async deletePlace(payload: PlaceDeleteInput, context: DataContext): Promise<DomainPlace> {
        const remote = await this.gateway.delete<MySiteView>(payload);
        return toDomainPlace((remote || {}) as MySiteView, context);
    }
}
