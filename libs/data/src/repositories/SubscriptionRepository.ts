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
    SubscriptionStartBody,
    WebSubscriptionMineView,
    WebSubscriptionView,
} from '../remote/http-data-sources';
import type { DataContextProvider } from './types';
import { BaseRepository, type DisposableRepository } from './types';

export interface ISubscriptionRepository extends DisposableRepository {
    fetchPlans(params?: Record<string, unknown>): Promise<ListResult<ProductView>>;
    fetchMembershipInfo(): Promise<MembershipView>;
    validateMembership(body: CreateMembershipBody, params?: Record<string, unknown>): Promise<MembershipView>;
    /**
     * Records which owned clouds go when the quota shrinks. `cloudIds` is the final state — an
     * owned cloud left out is unmarked, and an empty list clears every mark. Remote-only and
     * uncached like the rest of this repository; callers refresh what they render afterwards.
     */
    markDrops(body: MembershipDropsBody): Promise<MembershipDropsResult>;

    /**
     * Admin console surface (ADR-0101). Remote-only like the rest of this repository, which is the
     * point: these reads are other users' records and must never reach a local cache.
     */
    fetchAdminMemberships(
        params?: Record<string, unknown>,
        opts?: AdminEndpointOptions
    ): Promise<ListResult<MembershipView>>;
    updateMembershipByAdmin(userId: string, body: MembershipBody, opts?: AdminOverrideOptions): Promise<MembershipView>;
    /** Full refund of a web subscription's last paid charge; the subscription expires at once. */
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

    /**
     * The web subscription — one per account, billed through the payment provider rather than a store.
     * Remote-only like the rest: the landing site's account pages read it and keep no copy.
     */
    fetchMySubscription(): Promise<WebSubscriptionMineView>;
    /** The cards the payment provider holds; `isDefault` marks the one it charges. */
    fetchSubscriptionCards(): Promise<BillkeyView[]>;
    /** What the provider's card window opens with, for the product the card is for. */
    issueBillingKey(productId: string): Promise<BillingIssueParams>;
    startSubscription(body: SubscriptionStartBody): Promise<WebSubscriptionView>;
    changeSubscription(productId: string): Promise<WebSubscriptionView>;
    cancelSubscription(): Promise<WebSubscriptionView>;
    /** Adds a card; the default card stays as it was. */
    addCard(body: SubscriptionCardBody): Promise<BillkeyView>;
    /** Makes a card the one charged. */
    setDefaultCard(billkeyId: string): Promise<BillkeyView>;
    /** The payment service refuses the default card and the card a subscription in use is charged to. */
    removeCard(billkeyId: string): Promise<BillkeyView>;
}

/**
 * Membership/IAP surface (introduced in ADR-0070 decision 5, late stage 2). Remote-only by nature — same shape as
 * `AuthRepository`/`DeviceRepository`: nothing here is a cacheable entity, so there is no local
 * data source to compose. `ISubscriptionHttpDataSource` injection is optional through stage 2 (every
 * `createRepositories` call site must still construct this repository even before `httpFactory`
 * exists) — every method throws a clear "not wired yet" error until injected. Stage 4 promotes it to
 * required once the REST hooks actually move behind it.
 */
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

    public async fetchMySubscription(): Promise<WebSubscriptionMineView> {
        return this.requireHttp().fetchMySubscription();
    }

    public async fetchSubscriptionCards(): Promise<BillkeyView[]> {
        return this.requireHttp().fetchSubscriptionCards();
    }

    public async issueBillingKey(productId: string): Promise<BillingIssueParams> {
        return this.requireHttp().issueBillingKey(productId);
    }

    public async startSubscription(body: SubscriptionStartBody): Promise<WebSubscriptionView> {
        return this.requireHttp().startSubscription(body);
    }

    public async changeSubscription(productId: string): Promise<WebSubscriptionView> {
        return this.requireHttp().changeSubscription(productId);
    }

    public async cancelSubscription(): Promise<WebSubscriptionView> {
        return this.requireHttp().cancelSubscription();
    }

    public async addCard(body: SubscriptionCardBody): Promise<BillkeyView> {
        return this.requireHttp().addCard(body);
    }

    public async setDefaultCard(billkeyId: string): Promise<BillkeyView> {
        return this.requireHttp().setDefaultCard(billkeyId);
    }

    public async removeCard(billkeyId: string): Promise<BillkeyView> {
        return this.requireHttp().removeCard(billkeyId);
    }
}
