import { executeSignedRelayRequest } from '@chatic/web-core';

import { DOU_ENDPOINT, isAwsAccountNo } from '../apis/shared';

import type {
    CloudBody,
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

/**
 * Fetches the user list available to the current signed-in user.
 * Mainly used by admin search and user-list screens.
 */
export const fetchUsers = async (params: Params): Promise<ListResult<UserView>> => {
    return executeSignedRelayRequest<ListResult<UserView>, never, Params>({
        method: 'GET',
        baseURL: `${DOU_ENDPOINT}/hello/user/list`,
        params: { ...params },
    });
};

/**
 * Fetches the clouds owned by or accessible to the current signed-in user.
 * Always forces `view: 'mine'` so the response stays scoped to the current account.
 */
export const fetchClouds = async (params: Params = {}): Promise<ListResult<CloudView>> => {
    return executeSignedRelayRequest<ListResult<CloudView>, never, Params & { view: 'mine' }>({
        method: 'GET',
        baseURL: `${DOU_ENDPOINT}/clouds/0/list`,
        params: { ...params, view: 'mine' },
    });
};

/**
 * Updates the profile data of a specific cloud.
 * Currently used by single-field edit flows such as cloud name changes.
 */
export const updateCloud = async (cloudId: string, body: CloudBody): Promise<CloudView> => {
    return executeSignedRelayRequest<CloudView, CloudBody>({
        method: 'PUT',
        baseURL: `${DOU_ENDPOINT}/clouds/${cloudId}`,
        body,
    });
};

/**
 * Issues a delegation token used to switch the current session to another cloud.
 * Rejects a mistakenly stored AWS account number before the network request is sent.
 */
export const issueCloudDelegationToken = async (target: string): Promise<CloudDelegationTokenView> => {
    if (isAwsAccountNo(target)) {
        throw new Error(`issueCloudDelegationToken: refusing AWS account-no as cloud target: ${target}`);
    }

    return executeSignedRelayRequest<CloudDelegationTokenView, { target: string }, { legacy: false }>({
        method: 'POST',
        baseURL: `${DOU_ENDPOINT}/users/0/delegate-cloud`,
        body: { target },
        params: { legacy: false },
    });
};

/**
 * Registers the current device push token with the relay server.
 * When `force` is true, the broker is forced to recreate or re-enable the cached endpoint.
 */
export const registerDeviceToken = async (
    body: RegisterDeviceTokenBody,
    opts?: { force?: boolean }
): Promise<RegisterDeviceResult> => {
    return executeSignedRelayRequest<RegisterDeviceResult, RegisterDeviceTokenBody, { force?: string }>({
        method: 'POST',
        baseURL: `${DOU_ENDPOINT}/users/0/reg-dev`,
        params: opts?.force ? { force: 'true' } : undefined,
        body,
    });
};

/**
 * Verifies a token received from the native app and issues a user token for the web session.
 */
export const verifyNativeAppToken = async (body: VerifyNativeTokenBody): Promise<UserTokenView> => {
    return executeSignedRelayRequest<UserTokenView, VerifyNativeTokenBody, { token: 1 }>({
        method: 'POST',
        baseURL: `${DOU_ENDPOINT}/users/0/verify-native-token`,
        params: { token: 1 },
        body,
    });
};

/**
 * Executes the `send / resend / check / confirm` steps of the email verification flow.
 * Dry-run policy for local and dev environments is decided in the hook layer, not here.
 */
export const verifyEmail = async (
    body: CloudVerifyEmailBody,
    params?: { dryRun?: boolean }
): Promise<CloudVerifyEmailView> => {
    return executeSignedRelayRequest<CloudVerifyEmailView, CloudVerifyEmailBody, { dryRun?: boolean }>({
        method: 'POST',
        baseURL: `${DOU_ENDPOINT}/clouds/0/verify-email`,
        params: { ...params },
        body,
    });
};
