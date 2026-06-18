import {
    calcSignature,
    cloudCore,
    executeCloudRequest,
    executeRelayRequest,
    executeSignedRelayRequest,
    getCoreEndpoint,
} from '@chatic/web-core';

import type {
    CloudExchangeTokenBody,
    LoginUserBody,
    RegisterUserV2Body,
    UserBody,
    UserTokenView,
    UserView,
    UserLogoutResult,
} from '@lemoncloud/chatic-backend-api';

import type { FindAliasBody, FindAliasView, VerifyAliasBody, VerifyAliasView } from '../types';
import type { OAuthRefreshBody } from '@lemoncloud/chatic-backend-api/dist/modules/auth/oauth2/oauth2-types';

/**
 * Issues a temporary auth token from a device identifier.
 * Used during the initial auth bootstrap in native shells or webviews.
 */
export const registerDevice = async (deviceId: string): Promise<UserTokenView> => {
    return executeRelayRequest<UserTokenView, { deviceId: string }>({
        method: 'POST',
        baseURL: `${getCoreEndpoint()}/oauth/register-device`,
        body: { deviceId },
    });
};

/**
 * Executes the basic sign-up request.
 * Used by the standard email/password account creation flow.
 */
export const registerUser = async (body: UserBody): Promise<UserView> => {
    return executeRelayRequest<UserView, UserBody>({
        method: 'POST',
        baseURL: `${getCoreEndpoint()}/oauth/register-user`,
        body,
    });
};

/**
 * Executes the extended sign-up request.
 * Uses the `email` flag to switch server-side email post-processing behavior.
 */
export const registerUserV2 = async (body: RegisterUserV2Body, email?: boolean): Promise<UserView> => {
    return executeRelayRequest<UserView, RegisterUserV2Body>({
        method: 'POST',
        baseURL: `${getCoreEndpoint()}/oauth/register-user-v2`,
        params: email !== undefined ? { email: email ? 'true' : 'false' } : undefined,
        body,
    });
};

/**
 * Executes the login request and returns the user token payload.
 * Always includes `token=1` so the server returns a token-bearing response.
 */
export const login = async (body: LoginUserBody, email?: boolean): Promise<UserTokenView> => {
    return executeRelayRequest<UserTokenView, LoginUserBody>({
        method: 'POST',
        baseURL: `${getCoreEndpoint()}/oauth/login-user`,
        params: { token: 1, ...(email !== undefined && { email: email ? 'true' : 'false' }) },
        body,
    });
};

/**
 * Exchanges a relay-issued cloud delegation token for an actual cloud user token.
 * This should only be called immediately before switching cloud sessions.
 */
export const issueCloudToken = async (baseURL: string, body: CloudExchangeTokenBody): Promise<UserTokenView> => {
    return executeSignedRelayRequest<UserTokenView, CloudExchangeTokenBody>({
        method: 'POST',
        baseURL: `${baseURL}/oauth/exchange-token`,
        body: { ...body },
    });
};

/**
 * Refreshes the cloud access token against the currently selected cloud backend.
 * Used for explicit refresh flows and cloud session recovery.
 */
export const refreshCloudToken = async (target?: string): Promise<UserTokenView> => {
    const token = cloudCore.getCloudToken();
    if (!token?.Token) throw new Error('No cloud token found');

    const { authId, accountId, identityId, identityToken } = token.Token;
    if (!authId || !accountId || !identityId || !identityToken) {
        throw new Error('Missing token fields for refresh');
    }

    const current = new Date().toISOString();
    const signature = calcSignature({ authId, accountId, identityId, identityToken: '' }, current);
    const body: OAuthRefreshBody = { current, signature, ...(target && { target }) };

    const backend = cloudCore.getBackend();
    const refreshed = await executeCloudRequest<UserTokenView, OAuthRefreshBody>({
        method: 'POST',
        baseURL: `${backend}/oauth/${authId}/refresh`,
        params: { token: 1 },
        body,
    });

    // Preserve client-only fields the backend does not echo back, such as thumbnails.
    const existing = cloudCore.getCloudToken();
    const merged = { ...existing, ...refreshed } as UserTokenView;
    cloudCore.saveCloudToken(merged);
    return merged;
};

/**
 * Checks whether the email alias already exists.
 * Used for account recovery and pre-sign-up duplication checks.
 */
export const findAlias = async (body: FindAliasBody): Promise<FindAliasView> => {
    return executeRelayRequest<FindAliasView, FindAliasBody>({
        method: 'POST',
        baseURL: `${getCoreEndpoint()}/oauth/find-alias`,
        body,
    });
};

/**
 * Executes the email alias verification flow.
 * Forwards the `send / resend / check / change / confirm` steps directly to the server.
 */
export const verifyAlias = async (body: VerifyAliasBody): Promise<VerifyAliasView> => {
    return executeRelayRequest<VerifyAliasView, VerifyAliasBody>({
        method: 'POST',
        baseURL: `${getCoreEndpoint()}/oauth/verify-alias`,
        body,
    });
};

/**
 * Executes the relay logout request.
 * Local state cleanup is handled by the hook layer afterward.
 */
export const logout = async (): Promise<UserLogoutResult> => {
    return executeRelayRequest<UserLogoutResult, Record<string, never>>({
        method: 'POST',
        baseURL: `${getCoreEndpoint()}/users/logout`,
        body: {},
    });
};
