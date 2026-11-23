import type { AggrResult, ListResult } from '@lemoncloud/chatic-backend-api/dist/cores/types';
import type {
    CloudView,
    CreateMembershipBody,
    MembershipBody,
    MembershipDropsBody,
    MembershipView,
    ProductView,
} from '@lemoncloud/chatic-backend-api';
import type {
    AdminSubscriptionView,
    BillingIssueParams,
    BillkeyView,
    MembershipDropsResult,
    SubscriptionCardBody,
    SubscriptionRefundBody,
    SubscriptionSandboxParams,
    SubscriptionStartBody,
    SubscriptionStartParams,
    WebSubscriptionView,
} from '@chatic/http';
import type { SubscriptionHttpDomainGateway } from '../gateways';

export type {
    AdminSubscriptionView,
    BillingIssueParams,
    BillkeyView,
    MembershipDropsResult,
    SubscriptionCardBody,
    SubscriptionCardIdBody,
    SubscriptionPayer,
    SubscriptionRefundBody,
    SubscriptionSandboxParams,
    SubscriptionStartBody,
    SubscriptionStartParams,
    WebSubscriptionStatus,
    WebSubscriptionView,
} from '@chatic/http';

export interface ISubscriptionHttpDataSource {
    fetchPlans(params?: Record<string, unknown>): Promise<ListResult<ProductView>>;
    fetchMembershipInfo(): Promise<MembershipView>;
    validateMembership(body: CreateMembershipBody, params?: Record<string, unknown>): Promise<MembershipView>;
    markDrops(body: MembershipDropsBody): Promise<MembershipDropsResult>;

    fetchAdminMemberships(
        params?: Record<string, unknown>,
        opts?: AdminEndpointOptions
    ): Promise<ListResult<MembershipView>>;
    updateMembershipByAdmin(userId: string, body: MembershipBody, opts?: AdminOverrideOptions): Promise<MembershipView>;
    refundSubscriptionByAdmin(
        userId: string,
        body: SubscriptionRefundBody,
        opts?: AdminEndpointOptions
    ): Promise<AdminSubscriptionView>;
    fetchAdminClouds(
        ownerId: string,
        params?: Record<string, unknown>,
        opts?: AdminEndpointOptions
    ): Promise<ListResult<CloudView, AggrResult>>;

    fetchSubscriptionCards(params?: SubscriptionSandboxParams): Promise<BillkeyView[]>;
    issueBillingKey(productId: string, params?: SubscriptionSandboxParams): Promise<BillingIssueParams>;
    startSubscription(body: SubscriptionStartBody, params?: SubscriptionStartParams): Promise<WebSubscriptionView>;
    changeSubscription(productId: string): Promise<WebSubscriptionView>;
    cancelSubscription(): Promise<WebSubscriptionView>;
    addCard(body: SubscriptionCardBody, params?: SubscriptionSandboxParams): Promise<BillkeyView>;
    setDefaultCard(billkeyId: string, params?: SubscriptionSandboxParams): Promise<BillkeyView>;
    removeCard(billkeyId: string, params?: SubscriptionSandboxParams): Promise<BillkeyView>;
}

export interface AdminEndpointOptions {
    endpoint?: string;
}

export interface AdminOverrideOptions extends AdminEndpointOptions {
    auto?: boolean;
}

export class SubscriptionHttpDataSource implements ISubscriptionHttpDataSource {
    constructor(private readonly gateway: SubscriptionHttpDomainGateway) {}

    fetchPlans(params?: Record<string, unknown>): Promise<ListResult<ProductView>> {
        return this.gateway.plans(params);
    }

    fetchMembershipInfo(): Promise<MembershipView> {
        return this.gateway.membership();
    }

    validateMembership(body: CreateMembershipBody, params?: Record<string, unknown>): Promise<MembershipView> {
        return this.gateway.validateMembership(body, params);
    }

    markDrops(body: MembershipDropsBody): Promise<MembershipDropsResult> {
        return this.gateway.markDrops(body);
    }

    fetchAdminMemberships(
        params?: Record<string, unknown>,
        opts?: AdminEndpointOptions
    ): Promise<ListResult<MembershipView>> {
        return this.gateway.adminMemberships(params, opts);
    }

    updateMembershipByAdmin(
        userId: string,
        body: MembershipBody,
        opts?: AdminOverrideOptions
    ): Promise<MembershipView> {
        return this.gateway.updateMembershipByAdmin(userId, body, opts?.auto ? { auto: 1 } : undefined, {
            endpoint: opts?.endpoint,
        });
    }

    refundSubscriptionByAdmin(
        userId: string,
        body: SubscriptionRefundBody,
        opts?: AdminEndpointOptions
    ): Promise<AdminSubscriptionView> {
        return this.gateway.refundSubscriptionByAdmin(userId, body, undefined, opts);
    }

    fetchAdminClouds(
        ownerId: string,
        params?: Record<string, unknown>,
        opts?: AdminEndpointOptions
    ): Promise<ListResult<CloudView, AggrResult>> {
        return this.gateway.adminClouds(ownerId, params, opts);
    }

    fetchSubscriptionCards(params?: SubscriptionSandboxParams): Promise<BillkeyView[]> {
        return this.gateway.subscriptionCards(params);
    }

    issueBillingKey(productId: string, params?: SubscriptionSandboxParams): Promise<BillingIssueParams> {
        return this.gateway.issueBillingKey({ productId }, params);
    }

    startSubscription(body: SubscriptionStartBody, params?: SubscriptionStartParams): Promise<WebSubscriptionView> {
        return this.gateway.startSubscription(body, params);
    }

    changeSubscription(productId: string): Promise<WebSubscriptionView> {
        return this.gateway.changeSubscription({ productId });
    }

    cancelSubscription(): Promise<WebSubscriptionView> {
        return this.gateway.cancelSubscription();
    }

    addCard(body: SubscriptionCardBody, params?: SubscriptionSandboxParams): Promise<BillkeyView> {
        return this.gateway.addCard(body, params);
    }

    setDefaultCard(billkeyId: string, params?: SubscriptionSandboxParams): Promise<BillkeyView> {
        return this.gateway.setDefaultCard({ billkeyId }, params);
    }

    removeCard(billkeyId: string, params?: SubscriptionSandboxParams): Promise<BillkeyView> {
        return this.gateway.removeCard({ billkeyId }, params);
    }
}
