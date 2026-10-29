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
    ListValidateParam,
    ValidateAPIBody,
    ValidateAPIResponse,
} from '@lemoncloud/chatic-iap-api/dist/modules/in-app-pay/views';
import type { ReceiptModel } from '@lemoncloud/chatic-iap-api/dist/modules/in-app-pay/model';
import type { HttpGatewayExecutor } from './types';

/** `/products` · `/memberships` · `/subscriptions` · IAP `/validate` wire vocabulary. */
export interface SubscriptionHttpGateway {
    /** GET {relay}/products/plans. */
    plans(params?: Record<string, unknown>): Promise<ListResult<ProductView>>;
    /** POST {iap}/validate/google. */
    validateGoogle(body: ValidateAPIBody, params?: Record<string, unknown>): Promise<ValidateAPIResponse>;
    /** POST {iap}/validate/apple. */
    validateApple(body: ValidateAPIBody, params?: Record<string, unknown>): Promise<ValidateAPIResponse>;
    /** GET {iap}/validate?active=1 — `active: 1` is fixed. */
    receipts(params: ListValidateParam): Promise<ListResult<ReceiptModel>>;
    /** GET {iap}/validate/{receiptId}. */
    receiptDetail(receiptId: string, params?: Record<string, unknown>): Promise<ValidateAPIResponse>;
    /** GET {relay}/memberships/0/mine. */
    membership(): Promise<MembershipView>;
    /** POST {relay}/memberships/0. */
    validateMembership(body: CreateMembershipBody, params?: Record<string, unknown>): Promise<MembershipView>;
    /**
     * POST {relay}/memberships/0/drops — marks which owned clouds go when the cloud quota shrinks.
     *
     * `cloudIds` is the final state, not a delta: an owned cloud left out has its mark cleared, and
     * an empty list clears every mark. Scoped to the current session (`0`); the relay answers 403
     * when a listed cloud is not the caller's.
     */
    markDrops(body: MembershipDropsBody): Promise<MembershipDropsResult>;

    /**
     * GET {relay}/memberships/0/list — the admin console's membership list.
     *
     * Admin-only on the relay (`hasAdminRole`), and the plain `GET /memberships` routes here too,
     * so there is no unguarded way to read someone else's membership.
     */
    adminMemberships(
        params?: Record<string, unknown>,
        options?: AdminEndpointOptions
    ): Promise<ListResult<MembershipView>>;
    /** PUT {relay}/memberships/{userId}/admin — the admin override (grant/block/release). */
    updateMembershipByAdmin(
        userId: string,
        body: MembershipBody,
        params?: Record<string, unknown>,
        options?: AdminEndpointOptions
    ): Promise<MembershipView>;
    /**
     * POST {relay}/subscriptions/{userId}/refund — the admin refund of a web (payments-side) subscription.
     *
     * Full refund of the last paid charge, and the subscription expires at once; there is no partial
     * refund and no undo. Admin-only on the relay (`hasAdminRole`). The relay answers 409 when there is
     * no paid charge to refund — a trial, a first charge still pending, or one already refunded — and
     * 404 when the user has no web subscription at all.
     */
    refundSubscriptionByAdmin(
        userId: string,
        body: SubscriptionRefundBody,
        params?: Record<string, unknown>,
        options?: AdminEndpointOptions
    ): Promise<AdminSubscriptionView>;
    /**
     * GET {relay}/clouds/0/list?view=admin&valid=0 — one user's clouds, with a status aggregation.
     *
     * Separate from `CloudHttpGateway.list` rather than a looser version of it: that one pins
     * `view: 'mine'` and answers a different question. `valid: 0` overrides a server default of `1`
     * that hides expired clouds, which an operator reviewing the fallout of a block needs to see.
     *
     * The filter is `ownerId`. **Not `userId`** — outside the relay's `mine` branch `userId` is not
     * read at all, so passing it instead would list every user's clouds.
     *
     * **This endpoint is NOT gated by the relay** (`api-clouds.ts` `doGetList`, verified
     * 2026-09-10). It computes `hasAdmin` and then never authorizes on it, and it pins an owner
     * only inside the `view === 'mine'` branch — so any authenticated session can read anyone's
     * clouds, `view=mine&userId=<victim>` included. Nothing in this file changes that; the console's
     * admin gate is the only check in the stack today, and a client gate is not a check. Fixing it
     * belongs in the backend service. Named here so the next reader does not mistake the pinned
     * `view: 'admin'` for an authorization boundary — it is not one.
     *
     * The two membership calls above are different: the relay really does enforce `hasAdminRole`
     * on both before doing any work.
     */
    adminClouds(
        ownerId: string,
        params?: Record<string, unknown>,
        options?: AdminEndpointOptions
    ): Promise<ListResult<CloudView, AggrResult>>;

    // The web subscription — the one billed through the payment provider rather than a store, kept per
    // account (one at most) on the relay. Every call is scoped to the current session (`0`).
    /** GET {relay}/subscriptions/0/mine — the account's web subscription, if it has one. */
    mySubscription(): Promise<WebSubscriptionMineView>;
    /** GET {relay}/subscriptions/0/cards — the cards the payment provider holds for the account. */
    subscriptionCards(): Promise<BillkeyView[]>;
    /** POST {relay}/subscriptions/0/issue — what the provider's card window opens with, for a product. */
    issueBillingKey(body: { productId: string }): Promise<BillingIssueParams>;
    /**
     * POST {relay}/subscriptions/0/start — starts the subscription (a trial when the account may have
     * one). A charge the card company declines answers 403 `INVALID PAYMENT`, with nothing saved.
     */
    startSubscription(body: SubscriptionStartBody): Promise<WebSubscriptionView>;
    /** POST {relay}/subscriptions/0/change — an upgrade charges the difference now; a downgrade waits. */
    changeSubscription(body: { productId: string }): Promise<WebSubscriptionView>;
    /** POST {relay}/subscriptions/0/cancel — stops renewing; the paid period runs to its end. */
    cancelSubscription(): Promise<WebSubscriptionView>;
    /** POST {relay}/subscriptions/0/card — registers a card for the subscription. */
    replaceCard(body: SubscriptionCardBody): Promise<BillkeyView>;
    /** POST {relay}/subscriptions/0/card-delete — removes the subscription's card; refused while in use. */
    removeCard(): Promise<WebSubscriptionView>;
}

/*
 * The web subscription's shapes. The server's package does not carry this module yet, so they are
 * declared here from its contract, and only the fields a caller reads.
 */

export type WebSubscriptionStatus = 'pending' | 'trial' | 'active' | 'canceling' | 'expired';

/** `SubscriptionView`. Times are epoch milliseconds. */
export interface WebSubscriptionView {
    id?: string;
    platform?: string;
    status?: WebSubscriptionStatus;
    productId?: string;
    /** A downgrade waiting for the next renewal. */
    pendingProductId?: string;
    validFrom?: number;
    validUntil?: number;
    autoRenewing?: boolean;
    trialUsed?: boolean;
}

/** `SubscriptionMineView` — empty when the account has no web subscription. */
export interface WebSubscriptionMineView {
    subscription?: WebSubscriptionView;
}

/** `BillkeyView` — a card the payment provider holds. It carries no expiry. */
export interface BillkeyView {
    id?: string;
    provider?: string;
    status?: string;
    cardIssuer?: string;
    /** Masked: `123412******5678`. */
    cardNumber?: string;
    /** The card the payment provider charges. */
    isDefault?: boolean;
    issuedAt?: number;
}

/** `IssueParams` — the store, channel and issue the card window opens with. */
export interface BillingIssueParams {
    provider?: string;
    storeId: string;
    channelKey: string;
    customerId: string;
    issueId: string;
    issueName: string;
}

/** The card holder the card company requires with every card. */
export interface SubscriptionPayer {
    name: string;
    phone: string;
    email: string;
}

/** A start with a card just registered carries its key and holder; without one, the card on file pays. */
export interface SubscriptionStartBody extends Partial<SubscriptionPayer> {
    productId: string;
    billingKey?: string;
}

export interface SubscriptionCardBody extends SubscriptionPayer {
    billingKey: string;
}

/**
 * Lets the admin console aim these calls at a relay other than the configured one.
 *
 * Only the admin calls take it. The app's own calls must never leave the relay they were
 * authenticated against, and the console needs to compare stages the way the log console does —
 * so the override is opt-in per call rather than a mode on the client.
 */
export interface AdminEndpointOptions {
    /** Full relay base, e.g. `https://api.example.com/v1`. Falls back to the configured one. */
    endpoint?: string;
}

/**
 * Response of `POST {relay}/memberships/0/drops`.
 *
 * The server does not publish this type, so it is declared here from the observed contract:
 * - `cloudIds` — the clouds now marked to go (the list that was just written).
 * - `owned` — how many clouds the caller owns.
 * - `maxClouds` — the cloud quota of the current membership, when there is one.
 * - `excess` — how many more clouds still have to be picked before the marks cover the overflow.
 */
export interface MembershipDropsResult {
    cloudIds: string[];
    owned: number;
    maxClouds?: number;
    excess?: number;
}

/**
 * Body of `POST {relay}/subscriptions/{userId}/refund`. The relay refuses an empty `reason` (400).
 *
 * Declared here because the installed backend package predates the web subscription and publishes
 * neither this nor the response below. Once that package is bumped, both give way to its own
 * `SubscriptionRefundBody` / `SubscriptionView`.
 */
export interface SubscriptionRefundBody {
    reason: string;
}

/**
 * The relay's view of a web subscription, as returned by the admin refund — only the fields the
 * console reads. `status` is the payments-side one (`pending` / `trial` / `active` / `canceling` /
 * `expired`), not the membership's; after a refund it is `expired`.
 */
export interface AdminSubscriptionView {
    id?: string;
    userId?: string;
    platform?: string;
    status?: string;
    productId?: string;
    validFrom?: number;
    validUntil?: number;
    autoRenewing?: boolean;
}

export const createSubscriptionHttpGateway = (exec: HttpGatewayExecutor): SubscriptionHttpGateway => {
    const relay = () => exec.resolveEndpoint('relay');
    const iap = () => exec.resolveEndpoint('iap');

    return {
        plans: params =>
            exec.executeSignedRelayRequest<ListResult<ProductView>, never, Record<string, unknown>>({
                method: 'GET',
                baseURL: `${relay()}/products/plans`,
                params: { ...params },
            }),

        validateGoogle: (body, params) =>
            exec.executeSignedRelayRequest<ValidateAPIResponse, ValidateAPIBody, Record<string, unknown>>({
                method: 'POST',
                baseURL: `${iap()}/validate/google`,
                params: { ...params },
                body,
            }),

        validateApple: (body, params) =>
            exec.executeSignedRelayRequest<ValidateAPIResponse, ValidateAPIBody, Record<string, unknown>>({
                method: 'POST',
                baseURL: `${iap()}/validate/apple`,
                params: { ...params },
                body,
            }),

        receipts: params =>
            exec.executeSignedRelayRequest<ListResult<ReceiptModel>, never, Record<string, unknown>>({
                method: 'GET',
                baseURL: `${iap()}/validate`,
                params: { ...params, active: 1 },
            }),

        receiptDetail: (receiptId, params) =>
            exec.executeSignedRelayRequest<ValidateAPIResponse, never, Record<string, unknown>>({
                method: 'GET',
                baseURL: `${iap()}/validate/${receiptId}`,
                params: { ...params },
            }),

        membership: () =>
            exec.executeSignedRelayRequest<MembershipView>({
                method: 'GET',
                baseURL: `${relay()}/memberships/0/mine`,
            }),

        validateMembership: (body, params) =>
            exec.executeSignedRelayRequest<MembershipView, CreateMembershipBody, Record<string, unknown>>({
                method: 'POST',
                baseURL: `${relay()}/memberships/0`,
                params: { ...params },
                body,
            }),

        markDrops: body =>
            exec.executeSignedRelayRequest<MembershipDropsResult, MembershipDropsBody>({
                method: 'POST',
                baseURL: `${relay()}/memberships/0/drops`,
                body,
            }),

        adminMemberships: (params, options) =>
            exec.executeSignedRelayRequest<ListResult<MembershipView>, never, Record<string, unknown>>({
                method: 'GET',
                baseURL: `${options?.endpoint || relay()}/memberships/0/list`,
                params: { ...params },
            }),

        updateMembershipByAdmin: (userId, body, params, options) =>
            exec.executeSignedRelayRequest<MembershipView, MembershipBody, Record<string, unknown>>({
                method: 'PUT',
                baseURL: `${options?.endpoint || relay()}/memberships/${userId}/admin`,
                params: { ...params },
                body,
            }),

        refundSubscriptionByAdmin: (userId, body, params, options) =>
            exec.executeSignedRelayRequest<AdminSubscriptionView, SubscriptionRefundBody, Record<string, unknown>>({
                method: 'POST',
                baseURL: `${options?.endpoint || relay()}/subscriptions/${userId}/refund`,
                params: { ...params },
                body,
            }),

        adminClouds: (ownerId, params, options) =>
            exec.executeSignedRelayRequest<
                ListResult<CloudView, AggrResult>,
                never,
                Record<string, unknown> & { view: 'admin' }
            >({
                method: 'GET',
                baseURL: `${options?.endpoint || relay()}/clouds/0/list`,
                params: { ...params, ownerId, view: 'admin', valid: 0 },
            }),

        mySubscription: () =>
            exec.executeSignedRelayRequest<WebSubscriptionMineView>({
                method: 'GET',
                baseURL: `${relay()}/subscriptions/0/mine`,
            }),

        subscriptionCards: () =>
            exec.executeSignedRelayRequest<BillkeyView[]>({
                method: 'GET',
                baseURL: `${relay()}/subscriptions/0/cards`,
            }),

        issueBillingKey: body =>
            exec.executeSignedRelayRequest<BillingIssueParams, { productId: string }>({
                method: 'POST',
                baseURL: `${relay()}/subscriptions/0/issue`,
                body,
            }),

        startSubscription: body =>
            exec.executeSignedRelayRequest<WebSubscriptionView, SubscriptionStartBody>({
                method: 'POST',
                baseURL: `${relay()}/subscriptions/0/start`,
                body,
            }),

        changeSubscription: body =>
            exec.executeSignedRelayRequest<WebSubscriptionView, { productId: string }>({
                method: 'POST',
                baseURL: `${relay()}/subscriptions/0/change`,
                body,
            }),

        // The relay's gateway refuses a POST with no body at all — the browser sees it as a failed
        // cross-origin check — so the two commands that take nothing send an empty object.
        cancelSubscription: () =>
            exec.executeSignedRelayRequest<WebSubscriptionView, Record<string, never>>({
                method: 'POST',
                baseURL: `${relay()}/subscriptions/0/cancel`,
                body: {},
            }),

        replaceCard: body =>
            exec.executeSignedRelayRequest<BillkeyView, SubscriptionCardBody>({
                method: 'POST',
                baseURL: `${relay()}/subscriptions/0/card`,
                body,
            }),

        removeCard: () =>
            exec.executeSignedRelayRequest<WebSubscriptionView, Record<string, never>>({
                method: 'POST',
                baseURL: `${relay()}/subscriptions/0/card-delete`,
                body: {},
            }),
    };
};
