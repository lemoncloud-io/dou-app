import type { ListResult } from '@lemoncloud/chatic-backend-api/dist/cores/types';
import type { CreateMembershipBody, MembershipView, ProductView } from '@lemoncloud/chatic-backend-api';
import type {
    ListValidateParam,
    ValidateAPIBody,
    ValidateAPIResponse,
} from '@lemoncloud/chatic-iap-api/dist/modules/in-app-pay/views';
import type { ReceiptModel } from '@lemoncloud/chatic-iap-api/dist/modules/in-app-pay/model';
import type { ISubscriptionHttpDataSource } from '../remote/http-data-sources';
import type { DataContextProvider } from './types';
import { BaseRepositoryV2, type DisposableRepositoryV2 } from './types';

export interface ISubscriptionRepositoryV2 extends DisposableRepositoryV2 {
    fetchPlans(params?: Record<string, unknown>): Promise<ListResult<ProductView>>;
    validateGoogle(body: ValidateAPIBody, params?: Record<string, unknown>): Promise<ValidateAPIResponse>;
    validateApple(body: ValidateAPIBody, params?: Record<string, unknown>): Promise<ValidateAPIResponse>;
    fetchActiveSubscriptions(params: ListValidateParam): Promise<ListResult<ReceiptModel>>;
    fetchReceiptDetail(receiptId: string, params?: Record<string, unknown>): Promise<ValidateAPIResponse>;
    fetchMembershipInfo(): Promise<MembershipView>;
    validateMembership(body: CreateMembershipBody, params?: Record<string, unknown>): Promise<MembershipView>;
}

/**
 * Membership/IAP surface (ADR-0070 결정 5, 2단계 후반 신설). Remote-only by nature — same shape as
 * `AuthRepositoryV2`/`DeviceRepositoryV2`: nothing here is a cacheable entity, so there is no local
 * data source to compose. `ISubscriptionHttpDataSource` injection is optional through 2단계 (every
 * `createRepositoriesV2` call site must still construct this repository even before `httpFactory`
 * exists) — every method throws a clear "not wired yet" error until injected. 4단계 promotes it to
 * required once the REST hooks actually move behind it.
 */
export class SubscriptionRepositoryV2 extends BaseRepositoryV2 implements ISubscriptionRepositoryV2 {
    constructor(
        contextProvider: DataContextProvider,
        private readonly subscriptionHttpDataSource?: ISubscriptionHttpDataSource
    ) {
        super(contextProvider);
    }

    private requireHttp(): ISubscriptionHttpDataSource {
        if (!this.subscriptionHttpDataSource) {
            throw new Error(
                '[SubscriptionRepositoryV2] ISubscriptionHttpDataSource is not injected — httpFactory not wired yet.'
            );
        }
        return this.subscriptionHttpDataSource;
    }

    public async fetchPlans(params?: Record<string, unknown>): Promise<ListResult<ProductView>> {
        return this.requireHttp().fetchPlans(params);
    }

    public async validateGoogle(body: ValidateAPIBody, params?: Record<string, unknown>): Promise<ValidateAPIResponse> {
        return this.requireHttp().validateGoogle(body, params);
    }

    public async validateApple(body: ValidateAPIBody, params?: Record<string, unknown>): Promise<ValidateAPIResponse> {
        return this.requireHttp().validateApple(body, params);
    }

    public async fetchActiveSubscriptions(params: ListValidateParam): Promise<ListResult<ReceiptModel>> {
        return this.requireHttp().fetchActiveSubscriptions(params);
    }

    public async fetchReceiptDetail(receiptId: string, params?: Record<string, unknown>): Promise<ValidateAPIResponse> {
        return this.requireHttp().fetchReceiptDetail(receiptId, params);
    }

    public async fetchMembershipInfo(): Promise<MembershipView> {
        return this.requireHttp().fetchMembershipInfo();
    }

    public async validateMembership(
        body: CreateMembershipBody,
        params?: Record<string, unknown>
    ): Promise<MembershipView> {
        return this.requireHttp().validateMembership(body, params);
    }
}
