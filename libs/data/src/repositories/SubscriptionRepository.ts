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
    AdminEndpointOptions,
    AdminOverrideOptions,
    AdminSubscriptionView,
    BillingIssueParams,
    BillkeyView,
    ISubscriptionHttpDataSource,
    MembershipDropsResult,
    SubscriptionCardBody,
    SubscriptionRefundBody,
    SubscriptionSandboxParams,
    SubscriptionStartBody,
    SubscriptionStartParams,
    WebSubscriptionView,
} from '../remote/http-data-sources';
import type { DataContextProvider } from './types';
import { BaseRepository, type DisposableRepository } from './types';

export interface ISubscriptionRepository extends DisposableRepository {
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

export class SubscriptionRepository extends BaseRepository implements ISubscriptionRepository {
    constructor(
        contextProvider: DataContextProvider,
        private readonly subscriptionHttpDataSource?: ISubscriptionHttpDataSource
    ) {
        super(contextProvider);
    }

    private requireHttp(): ISubscriptionHttpDataSource {
        if (!this.subscriptionHttpDataSource) {
            throw new Error(
                '[SubscriptionRepository] ISubscriptionHttpDataSource is not injected — httpFactory not wired yet.'
            );
        }
        return this.subscriptionHttpDataSource;
    }

    public async fetchPlans(params?: Record<string, unknown>): Promise<ListResult<ProductView>> {
        return this.requireHttp().fetchPlans(params);
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

    public async markDrops(body: MembershipDropsBody): Promise<MembershipDropsResult> {
        return this.requireHttp().markDrops(body);
    }

    public async fetchAdminMemberships(
        params?: Record<string, unknown>,
        opts?: AdminEndpointOptions
    ): Promise<ListResult<MembershipView>> {
        return this.requireHttp().fetchAdminMemberships(params, opts);
    }

    public async updateMembershipByAdmin(
        userId: string,
        body: MembershipBody,
        opts?: AdminOverrideOptions
    ): Promise<MembershipView> {
        return this.requireHttp().updateMembershipByAdmin(userId, body, opts);
    }

    public async refundSubscriptionByAdmin(
        userId: string,
        body: SubscriptionRefundBody,
        opts?: AdminEndpointOptions
    ): Promise<AdminSubscriptionView> {
        return this.requireHttp().refundSubscriptionByAdmin(userId, body, opts);
    }

    public async fetchAdminClouds(
        ownerId: string,
        params?: Record<string, unknown>,
        opts?: AdminEndpointOptions
    ): Promise<ListResult<CloudView, AggrResult>> {
        return this.requireHttp().fetchAdminClouds(ownerId, params, opts);
    }

    public async fetchSubscriptionCards(params?: SubscriptionSandboxParams): Promise<BillkeyView[]> {
        return this.requireHttp().fetchSubscriptionCards(params);
    }

    public async issueBillingKey(productId: string, params?: SubscriptionSandboxParams): Promise<BillingIssueParams> {
        return this.requireHttp().issueBillingKey(productId, params);
    }

    public async startSubscription(
        body: SubscriptionStartBody,
        params?: SubscriptionStartParams
    ): Promise<WebSubscriptionView> {
        return this.requireHttp().startSubscription(body, params);
    }

    public async changeSubscription(productId: string): Promise<WebSubscriptionView> {
        return this.requireHttp().changeSubscription(productId);
    }

    public async cancelSubscription(): Promise<WebSubscriptionView> {
        return this.requireHttp().cancelSubscription();
    }

    public async addCard(body: SubscriptionCardBody, params?: SubscriptionSandboxParams): Promise<BillkeyView> {
        return this.requireHttp().addCard(body, params);
    }

    public async setDefaultCard(billkeyId: string, params?: SubscriptionSandboxParams): Promise<BillkeyView> {
        return this.requireHttp().setDefaultCard(billkeyId, params);
    }

    public async removeCard(billkeyId: string, params?: SubscriptionSandboxParams): Promise<BillkeyView> {
        return this.requireHttp().removeCard(billkeyId, params);
    }
}
