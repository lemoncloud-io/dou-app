import { executeSignedRelayRequest, getCoreEndpoint, getIapEndpoint } from './request';

import type {
    ValidateAPIBody,
    ValidateAPIResponse,
    ListValidateParam,
} from '@lemoncloud/chatic-iap-api/dist/modules/in-app-pay/views';
import type { ReceiptModel } from '@lemoncloud/chatic-iap-api/dist/modules/in-app-pay/model';
import type { ListResult } from '@lemoncloud/chatic-backend-api/dist/cores/types';
import type { Params } from '@lemoncloud/lemon-web-core';
import type { CloudView, CreateMembershipBody, MembershipView, ProductView } from '@lemoncloud/chatic-backend-api';

export const fetchPlans = async (params: Params = {}): Promise<ListResult<ProductView>> => {
    return executeSignedRelayRequest<ListResult<ProductView>, never, Params>({
        method: 'GET',
        baseURL: `${getCoreEndpoint()}/products/plans`,
        params: { ...params },
    });
};

export const validateGoogle = async (body: ValidateAPIBody, params: Params = {}): Promise<ValidateAPIResponse> => {
    return executeSignedRelayRequest<ValidateAPIResponse, ValidateAPIBody, Params>({
        method: 'POST',
        baseURL: `${getIapEndpoint()}/validate/google`,
        params: { ...params },
        body,
    });
};

export const validateApple = async (body: ValidateAPIBody, params: Params = {}): Promise<ValidateAPIResponse> => {
    return executeSignedRelayRequest<ValidateAPIResponse, ValidateAPIBody, Params>({
        method: 'POST',
        baseURL: `${getIapEndpoint()}/validate/apple`,
        params: { ...params },
        body,
    });
};

export const fetchActiveSubscriptions = async (params: ListValidateParam): Promise<ListResult<ReceiptModel>> => {
    return executeSignedRelayRequest<ListResult<ReceiptModel>, never, Record<string, unknown>>({
        method: 'GET',
        baseURL: `${getIapEndpoint()}/validate`,
        params: { ...params, active: 1 },
    });
};

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

export const fetchMembershipInfo = async (): Promise<MembershipView> => {
    return executeSignedRelayRequest<MembershipView>({
        method: 'GET',
        baseURL: `${getCoreEndpoint()}/memberships/0/mine`,
    });
};

export const validateMembership = async (body: CreateMembershipBody, params: Params = {}): Promise<MembershipView> => {
    return executeSignedRelayRequest<MembershipView, CreateMembershipBody, Params>({
        method: 'POST',
        baseURL: `${getCoreEndpoint()}/memberships/0`,
        params: { ...params },
        body,
    });
};

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
