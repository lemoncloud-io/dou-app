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

export interface SubscriptionHttpGateway {
    plans(params?: Record<string, unknown>): Promise<ListResult<ProductView>>;
    validateGoogle(body: ValidateAPIBody, params?: Record<string, unknown>): Promise<ValidateAPIResponse>;
    validateApple(body: ValidateAPIBody, params?: Record<string, unknown>): Promise<ValidateAPIResponse>;
    receipts(params: ListValidateParam): Promise<ListResult<ReceiptModel>>;
    receiptDetail(receiptId: string, params?: Record<string, unknown>): Promise<ValidateAPIResponse>;
    membership(): Promise<MembershipView>;
    validateMembership(body: CreateMembershipBody, params?: Record<string, unknown>): Promise<MembershipView>;
    markDrops(body: MembershipDropsBody): Promise<MembershipDropsResult>;

    adminMemberships(
        params?: Record<string, unknown>,
        options?: AdminEndpointOptions
    ): Promise<ListResult<MembershipView>>;
    updateMembershipByAdmin(
        userId: string,
        body: MembershipBody,
        params?: Record<string, unknown>,
        options?: AdminEndpointOptions
    ): Promise<MembershipView>;
    refundSubscriptionByAdmin(
        userId: string,
        body: SubscriptionRefundBody,
        params?: Record<string, unknown>,
        options?: AdminEndpointOptions
    ): Promise<AdminSubscriptionView>;
    adminClouds(
        ownerId: string,
        params?: Record<string, unknown>,
        options?: AdminEndpointOptions
    ): Promise<ListResult<CloudView, AggrResult>>;

    subscriptionCards(params?: SubscriptionSandboxParams): Promise<BillkeyView[]>;
    issueBillingKey(body: { productId: string }, params?: SubscriptionSandboxParams): Promise<BillingIssueParams>;
    startSubscription(body: SubscriptionStartBody, params?: SubscriptionStartParams): Promise<WebSubscriptionView>;
    changeSubscription(body: { productId: string }): Promise<WebSubscriptionView>;
    cancelSubscription(): Promise<WebSubscriptionView>;
    addCard(body: SubscriptionCardBody, params?: SubscriptionSandboxParams): Promise<BillkeyView>;
    setDefaultCard(body: SubscriptionCardIdBody, params?: SubscriptionSandboxParams): Promise<BillkeyView>;
    removeCard(body: SubscriptionCardIdBody, params?: SubscriptionSandboxParams): Promise<BillkeyView>;
}

export type WebSubscriptionStatus = 'pending' | 'trial' | 'active' | 'canceling' | 'expired';

export interface WebSubscriptionView {
    id?: string;
    platform?: string;
    status?: WebSubscriptionStatus;
    productId?: string;
    pendingProductId?: string;
    validFrom?: number;
    validUntil?: number;
    autoRenewing?: boolean;
    trialUsed?: boolean;
}

export interface BillkeyView {
    id?: string;
    provider?: string;
    status?: string;
    cardIssuer?: string;
    cardNumber?: string;
    isDefault?: boolean;
    issuedAt?: number;
}

export interface BillingIssueParams {
    provider?: string;
    storeId: string;
    channelKey: string;
    customerId: string;
    issueId: string;
    issueName: string;
}

export interface SubscriptionPayer {
    name: string;
    phone: string;
    email: string;
}

export interface SubscriptionStartBody extends Partial<SubscriptionPayer> {
    productId: string;
    billingKey?: string;
}

export interface SubscriptionCardBody extends SubscriptionPayer {
    billingKey: string;
}

export interface SubscriptionCardIdBody {
    billkeyId: string;
}

export interface SubscriptionSandboxParams {
    sandbox?: 1;
}

export interface SubscriptionStartParams extends SubscriptionSandboxParams {
    interval?: string;
}

export interface AdminEndpointOptions {
    endpoint?: string;
}

export interface MembershipDropsResult {
    cloudIds: string[];
    owned: number;
    maxClouds?: number;
    excess?: number;
}

export interface SubscriptionRefundBody {
    reason: string;
}

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

        subscriptionCards: params =>
            exec.executeSignedRelayRequest<BillkeyView[], never, SubscriptionSandboxParams>({
                method: 'GET',
                baseURL: `${relay()}/subscriptions/0/cards`,
                ...queryOf(params),
            }),

        issueBillingKey: (body, params) =>
            exec.executeSignedRelayRequest<BillingIssueParams, { productId: string }, SubscriptionSandboxParams>({
                method: 'POST',
                baseURL: `${relay()}/subscriptions/0/issue`,
                body,
                ...queryOf(params),
            }),

        startSubscription: (body, params) =>
            exec.executeSignedRelayRequest<WebSubscriptionView, SubscriptionStartBody, SubscriptionStartParams>({
                method: 'POST',
                baseURL: `${relay()}/subscriptions/0/start`,
                body,
                ...queryOf(params),
            }),

        changeSubscription: body =>
            exec.executeSignedRelayRequest<WebSubscriptionView, { productId: string }>({
                method: 'POST',
                baseURL: `${relay()}/subscriptions/0/change`,
                body,
            }),

        cancelSubscription: () =>
            exec.executeSignedRelayRequest<WebSubscriptionView, Record<string, never>>({
                method: 'POST',
                baseURL: `${relay()}/subscriptions/0/cancel`,
                body: {},
            }),

        addCard: (body, params) =>
            exec.executeSignedRelayRequest<BillkeyView, SubscriptionCardBody, SubscriptionSandboxParams>({
                method: 'POST',
                baseURL: `${relay()}/subscriptions/0/card`,
                body,
                ...queryOf(params),
            }),

        setDefaultCard: (body, params) =>
            exec.executeSignedRelayRequest<BillkeyView, SubscriptionCardIdBody, SubscriptionSandboxParams>({
                method: 'POST',
                baseURL: `${relay()}/subscriptions/0/card-default`,
                body,
                ...queryOf(params),
            }),

        removeCard: (body, params) =>
            exec.executeSignedRelayRequest<BillkeyView, SubscriptionCardIdBody, SubscriptionSandboxParams>({
                method: 'POST',
                baseURL: `${relay()}/subscriptions/0/card-delete`,
                body,
                ...queryOf(params),
            }),
    };
};

const queryOf = <T extends object>(params: T | undefined): { params?: T } => {
    const given = Object.fromEntries(
        Object.entries(params ?? {}).filter(([, value]) => value !== undefined && value !== '')
    ) as T;
    return Object.keys(given).length > 0 ? { params: given } : {};
};
