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
import type { HttpGatewayExecutor } from './types';

/** `/products` · `/memberships` · IAP `/validate` wire vocabulary. */
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
     * belongs in chatic-backend-api. Named here so the next reader does not mistake the pinned
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
}

/**
 * Lets the admin console aim these three at a relay other than the configured one.
 *
 * Only the admin calls take it. The app's own calls must never leave the relay they were
 * authenticated against, and the console needs to compare stages the way the log console does —
 * so the override is opt-in per call rather than a mode on the client.
 */
export interface AdminEndpointOptions {
    /** Full relay base, e.g. `https://api.example.com/v1`. Falls back to the configured one. */
    endpoint?: string;
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
    };
};
