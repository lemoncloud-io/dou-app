import type { AggrResult, ListResult } from '@lemoncloud/chatic-backend-api/dist/cores/types';
import type {
    CloudView,
    CreateMembershipBody,
    MembershipBody,
    MembershipView,
    ProductView,
} from '@lemoncloud/chatic-backend-api';
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

    fetchAdminMemberships(params?: Record<string, unknown>): Promise<ListResult<MembershipView>>;
    updateMembershipByAdmin(userId: string, body: MembershipBody, opts?: AdminOverrideOptions): Promise<MembershipView>;
    fetchAdminClouds(ownerId: string, params?: Record<string, unknown>): Promise<ListResult<CloudView, AggrResult>>;
}

/** `auto` provisions clouds up to the raised quota immediately. Off unless the operator asks. */
export interface AdminOverrideOptions {
    auto?: boolean;
}

/**
 * Remote-only source — no local data source, same shape as `AuthHttpDataSource`/
 * `DeviceSocketDataSource`. No domain model exists for this axis yet; views pass through
 * unchanged (alias-level, matching the precedent most existing domain models already follow —
 * see libs/data/docs/http-data-path.md §상세 구현 "도메인 매핑 깊이"). A real `DomainProduct` /
 * `DomainMembership` / `DomainReceipt` mapping is future work, not this data source's job to
 * invent.
 *
 * The admin console's reads (ADR-0082) land here too, `fetchAdminClouds` included — even though
 * clouds have their own repository. That one maps views through `toDomainCloud(view, context)`
 * using the CURRENT session's context, and `resolveCloudType` then labels ownership relative to
 * the viewer. Every row an admin lists belongs to somebody else, so that classification would be
 * quietly wrong. Passing through here keeps the views raw, and keeps `aggr` — which the domain
 * list result drops — intact.
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

    fetchAdminMemberships(params?: Record<string, unknown>): Promise<ListResult<MembershipView>> {
        return this.gateway.adminMemberships(params);
    }

    // The `1`/absent encoding is the wire's, so it stays here rather than in a caller — same as
    // `CloudHttpDataSource.makeCloud`'s `dryRun`. The console asks for `auto: true`.
    updateMembershipByAdmin(
        userId: string,
        body: MembershipBody,
        opts?: AdminOverrideOptions
    ): Promise<MembershipView> {
        return this.gateway.updateMembershipByAdmin(userId, body, opts?.auto ? { auto: 1 } : undefined);
    }

    fetchAdminClouds(ownerId: string, params?: Record<string, unknown>): Promise<ListResult<CloudView, AggrResult>> {
        return this.gateway.adminClouds(ownerId, params);
    }
}
