import type { ListResult } from '@lemoncloud/chatic-backend-api/dist/cores/types';
import type { CreateMembershipBody, MembershipView, ProductView } from '@lemoncloud/chatic-backend-api';
import type {
    ListValidateParam,
    ValidateAPIBody,
    ValidateAPIResponse,
} from '@lemoncloud/chatic-iap-api/dist/modules/in-app-pay/views';
import type { ReceiptModel } from '@lemoncloud/chatic-iap-api/dist/modules/in-app-pay/model';
import type { SubscriptionHttpDomainGateway } from '../gateways';

export interface ISubscriptionHttpDataSource {
    fetchPlans(params?: Record<string, unknown>): Promise<ListResult<ProductView>>;
    validateGoogle(body: ValidateAPIBody, params?: Record<string, unknown>): Promise<ValidateAPIResponse>;
    validateApple(body: ValidateAPIBody, params?: Record<string, unknown>): Promise<ValidateAPIResponse>;
    fetchActiveSubscriptions(params: ListValidateParam): Promise<ListResult<ReceiptModel>>;
    fetchReceiptDetail(receiptId: string, params?: Record<string, unknown>): Promise<ValidateAPIResponse>;
    fetchMembershipInfo(): Promise<MembershipView>;
    validateMembership(body: CreateMembershipBody, params?: Record<string, unknown>): Promise<MembershipView>;
}

/**
 * Remote-only source — no local data source, same shape as `AuthHttpDataSource`/
 * `DeviceSocketDataSource`. No domain model exists for this axis yet; views pass through
 * unchanged (alias-level, matching the precedent most existing domain models already follow —
 * see libs/data/docs/http-data-path.md §상세 구현 "도메인 매핑 깊이"). A real `DomainProduct` /
 * `DomainMembership` / `DomainReceipt` mapping is future work, not this data source's job to
 * invent.
 */
export class SubscriptionHttpDataSource implements ISubscriptionHttpDataSource {
    constructor(private readonly gateway: SubscriptionHttpDomainGateway) {}

    fetchPlans(params?: Record<string, unknown>): Promise<ListResult<ProductView>> {
        return this.gateway.plans(params);
    }

    validateGoogle(body: ValidateAPIBody, params?: Record<string, unknown>): Promise<ValidateAPIResponse> {
        return this.gateway.validateGoogle(body, params);
    }

    validateApple(body: ValidateAPIBody, params?: Record<string, unknown>): Promise<ValidateAPIResponse> {
        return this.gateway.validateApple(body, params);
    }

    fetchActiveSubscriptions(params: ListValidateParam): Promise<ListResult<ReceiptModel>> {
        return this.gateway.receipts(params);
    }

    fetchReceiptDetail(receiptId: string, params?: Record<string, unknown>): Promise<ValidateAPIResponse> {
        return this.gateway.receiptDetail(receiptId, params);
    }

    fetchMembershipInfo(): Promise<MembershipView> {
        return this.gateway.membership();
    }

    validateMembership(body: CreateMembershipBody, params?: Record<string, unknown>): Promise<MembershipView> {
        return this.gateway.validateMembership(body, params);
    }
}
