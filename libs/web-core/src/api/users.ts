import { executeSignedRelayRequest, getCoreEndpoint } from '../transport';

import type {
    CloudDelegationTokenView,
    CloudVerifyEmailBody,
    CloudVerifyEmailView,
    CloudView,
    RegisterDeviceTokenBody,
    UserTokenView,
    UserView,
} from '@lemoncloud/chatic-backend-api';
import type { ListResult } from '@lemoncloud/chatic-backend-api/dist/cores/types';
import type { VerifyNativeTokenBody } from '@lemoncloud/chatic-backend-api/dist/modules/auth/oauth2/oauth2-types';
import type { RegisterDeviceResult } from '@lemoncloud/chatic-pushes-api';
import type { Params } from '@lemoncloud/lemon-web-core';

const CORE_ENDPOINT = getCoreEndpoint();

export const isAwsAccountNo = (value: string): boolean => /^\d{12}$/.test(value);

export const fetchUsers = async (params: Params): Promise<ListResult<UserView>> => {
    return executeSignedRelayRequest<ListResult<UserView>, never, Params>({
        method: 'GET',
        baseURL: `${CORE_ENDPOINT}/hello/user/list`,
        params: { ...params },
    });
};

export const fetchClouds = async (params: Params = {}): Promise<ListResult<CloudView>> => {
    return executeSignedRelayRequest<ListResult<CloudView>, never, Params & { view: 'mine' }>({
        method: 'GET',
        baseURL: `${CORE_ENDPOINT}/clouds/0/list`,
        params: { ...params, view: 'mine' },
    });
};

export const issueCloudDelegationToken = async (target: string): Promise<CloudDelegationTokenView> => {
    if (isAwsAccountNo(target)) {
        throw new Error(`issueCloudDelegationToken: refusing AWS account-no as cloud target: ${target}`);
    }

    return executeSignedRelayRequest<CloudDelegationTokenView, { target: string }, { legacy: false }>({
        method: 'POST',
        baseURL: `${CORE_ENDPOINT}/users/0/delegate-cloud`,
        body: { target },
        params: { legacy: false },
    });
};

export const registerDeviceToken = async (
    body: RegisterDeviceTokenBody,
    opts?: { force?: boolean }
): Promise<RegisterDeviceResult> => {
    return executeSignedRelayRequest<RegisterDeviceResult, RegisterDeviceTokenBody, { force?: string }>({
        method: 'POST',
        baseURL: `${CORE_ENDPOINT}/users/0/reg-dev`,
        params: opts?.force ? { force: 'true' } : undefined,
        body,
    });
};

export const verifyNativeAppToken = async (body: VerifyNativeTokenBody): Promise<UserTokenView> => {
    return executeSignedRelayRequest<UserTokenView, VerifyNativeTokenBody, { token: 1 }>({
        method: 'POST',
        baseURL: `${CORE_ENDPOINT}/users/0/verify-native-token`,
        params: { token: 1 },
        body,
    });
};

export const verifyEmail = async (
    body: CloudVerifyEmailBody,
    params?: { dryRun?: boolean }
): Promise<CloudVerifyEmailView> => {
    return executeSignedRelayRequest<CloudVerifyEmailView, CloudVerifyEmailBody, { dryRun?: boolean }>({
        method: 'POST',
        baseURL: `${CORE_ENDPOINT}/clouds/0/verify-email`,
        params: { ...params },
        body,
    });
};
