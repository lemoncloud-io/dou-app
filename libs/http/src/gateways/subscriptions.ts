import type { ListResult } from '@lemoncloud/chatic-backend-api/dist/cores/types';
import type { CreateMembershipBody, MembershipView, ProductView } from '@lemoncloud/chatic-backend-api';
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
    };
};
