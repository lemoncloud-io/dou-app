import { executeSignedRelayRequest, getCoreEndpoint, getIapEndpoint } from '../transport';

import type {
    ListValidateParam,
    ValidateAPIBody,
    ValidateAPIResponse,
} from '@lemoncloud/chatic-iap-api/dist/modules/in-app-pay/views';
import type { ReceiptModel } from '@lemoncloud/chatic-iap-api/dist/modules/in-app-pay/model';
import type { ListResult } from '@lemoncloud/chatic-backend-api/dist/cores/types';
import type { Params } from '@lemoncloud/lemon-web-core';
import type {
    CloudBody,
    CloudView,
    CreateMembershipBody,
    MembershipView,
    ProductView,
} from '@lemoncloud/chatic-backend-api';

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

/**
 * Creates ONE cloud against the caller's membership quota.
 *
 * `POST /memberships/0` only ever enqueues a single `make` (with the one email in its body), so a
 * tier that allows several clouds needs this call for every cloud past the first — each with its
 * own verified address. The server guards the quota atomically (`guardQuota`) and answers 409 when
 * the allowance is already spent, so this is safe to call optimistically.
 *
 * `auto=1` is required: unlike the membership route, `make` defaults to `auto=0` and would create
 * the record without enqueueing the workspace assignment.
 */
export const makeCloud = async (body: CloudBody, params: Params = {}): Promise<CloudView> => {
    return executeSignedRelayRequest<CloudView, CloudBody, Params>({
        method: 'POST',
        baseURL: `${getCoreEndpoint()}/clouds/0/make`,
        params: { auto: 1, ...params },
        body,
    });
};

/**
 * Releases (deletes) one cloud, answering with the released record.
 *
 * `allowRecordError`: the response IS that record, and a cloud that failed provisioning keeps its
 * last trace in its own `error` column (`.accountNo[...] is invalid (duplicated by ...)`) — which is
 * exactly the cloud a user comes here to remove. Without the flag the default 200-body check would
 * rethrow that stale trace, and the cloud-manage screen would report a successful release
 * as a failure.
 */
export const deleteCloud = async (cloudId: string, params: Params = {}): Promise<CloudView> => {
    return executeSignedRelayRequest<CloudView, Record<string, never>, Params>({
        method: 'POST',
        baseURL: `${getCoreEndpoint()}/clouds/${cloudId}/release`,
        body: {},
        params: {
            ...params,
        },
        allowRecordError: true,
    });
};
