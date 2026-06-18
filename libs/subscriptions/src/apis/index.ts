import { executeSignedRelayRequest, getCoreEndpoint, getIapEndpoint } from '../../../web-core/src/api/request';

import type {
    ValidateAPIBody,
    ValidateAPIResponse,
    ListValidateParam,
} from '@lemoncloud/chatic-iap-api/dist/modules/in-app-pay/views';
import type { ReceiptModel } from '@lemoncloud/chatic-iap-api/dist/modules/in-app-pay/model';
import type { ListResult } from '@lemoncloud/chatic-backend-api/dist/cores/types';
import type { Params } from '@lemoncloud/lemon-web-core';
import type { CloudView, CreateMembershipBody, MembershipView, ProductView } from '@lemoncloud/chatic-backend-api';

/**
 * Fetches the product plans shown in subscription and membership screens.
 */
export const fetchPlans = async (params: Params = {}): Promise<ListResult<ProductView>> => {
    return executeSignedRelayRequest<ListResult<ProductView>, never, Params>({
        method: 'GET',
        baseURL: `${getCoreEndpoint()}/products/plans`,
        params: { ...params },
    });
};

/**
 * Validates a Google Play receipt.
 * Used right after purchase so the server can finalize the subscription state.
 */
export const validateGoogle = async (body: ValidateAPIBody, params: Params = {}): Promise<ValidateAPIResponse> => {
    return executeSignedRelayRequest<ValidateAPIResponse, ValidateAPIBody, Params>({
        method: 'POST',
        baseURL: `${getIapEndpoint()}/validate/google`,
        params: { ...params },
        body,
    });
};

/**
 * Validates an App Store receipt.
 * Used right after purchase so the server can finalize the subscription state.
 */
export const validateApple = async (body: ValidateAPIBody, params: Params = {}): Promise<ValidateAPIResponse> => {
    return executeSignedRelayRequest<ValidateAPIResponse, ValidateAPIBody, Params>({
        method: 'POST',
        baseURL: `${getIapEndpoint()}/validate/apple`,
        params: { ...params },
        body,
    });
};

/**
 * Fetches the active subscription list for the current user.
 * Always forces `active: 1` so only valid subscriptions are returned.
 */
export const fetchActiveSubscriptions = async (params: ListValidateParam): Promise<ListResult<ReceiptModel>> => {
    return executeSignedRelayRequest<ListResult<ReceiptModel>, never, Record<string, unknown>>({
        method: 'GET',
        baseURL: `${getIapEndpoint()}/validate`,
        params: { ...params, active: 1 },
    });
};

/**
 * Fetches the detailed validation result for a specific receipt.
 * History lookup and verbose response flags are controlled through `params`.
 */
export const fetchReceiptDetail = async (
    receiptId: string,
    params?: { v?: string | boolean; history?: string | boolean }
): Promise<ValidateAPIResponse> => {
    return executeSignedRelayRequest<ValidateAPIResponse, never, Record<string, unknown>>({
        method: 'GET',
        baseURL: `${getIapEndpoint()}/validate/${receiptId}`,
        params: { ...params },
    });
};

/**
 * Fetches the membership status for the current signed-in user.
 */
export const fetchMembershipInfo = async (): Promise<MembershipView> => {
    return executeSignedRelayRequest<MembershipView>({
        method: 'GET',
        baseURL: `${getCoreEndpoint()}/memberships/0/mine`,
    });
};

/**
 * Executes the membership create or refresh validation request.
 */
export const validateMembership = async (body: CreateMembershipBody, params: Params = {}): Promise<MembershipView> => {
    return executeSignedRelayRequest<MembershipView, CreateMembershipBody, Params>({
        method: 'POST',
        baseURL: `${getCoreEndpoint()}/memberships/0`,
        params: { ...params },
        body,
    });
};

/**
 * Releases the subscription or membership association for a specific cloud.
 * Used by subscription cleanup flows and account-management cloud release actions.
 */
export const deleteCloud = async (cloudId: string, params: Params = {}): Promise<CloudView> => {
    return executeSignedRelayRequest<CloudView, Record<string, never>, Params>({
        method: 'POST',
        baseURL: `${getCoreEndpoint()}/clouds/${cloudId}/release`,
        body: {},
        params: {
            ...params,
        },
    });
};
