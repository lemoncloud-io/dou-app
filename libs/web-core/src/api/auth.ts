import {
    calcSignature,
    executeCloudRequest,
    executeRelayRequest,
    executeSignedRelayRequest,
    getCoreEndpoint,
    getDynamicRelayBackend,
    getOAuthEndpoint,
    webTransport,
} from '../transport';

import type {
    CloudExchangeTokenBody,
    LoginUserBody,
    MyInviteView,
    RegisterUserV2Body,
    UserBody,
    UserProfile$,
    UserTokenView,
    UserView,
} from '@lemoncloud/chatic-backend-api';
import type { OAuthRefreshBody } from '@lemoncloud/chatic-backend-api/dist/modules/auth/oauth2/oauth2-types';
import type { TokenGenerateRequest, TokenGenerateResponse } from '@chatic/shared';
import { throwIfApiError } from '@chatic/shared';

import type { FindAliasBody, FindAliasView, VerifyAliasBody, VerifyAliasView } from './types';
import type { LemonOAuthToken } from '@lemoncloud/lemon-web-core';
import { MAX_RETRIES } from '../transport/error';
import { withRetry } from '../transport/utils';

export const registerDevice = async (deviceId: string): Promise<UserTokenView> => {
    return executeRelayRequest<UserTokenView, { deviceId: string }>({
        method: 'POST',
        baseURL: `${getCoreEndpoint()}/oauth/register-device`,
        body: { deviceId },
    });
};

export const registerUser = async (body: UserBody): Promise<UserView> => {
    return executeRelayRequest<UserView, UserBody>({
        method: 'POST',
        baseURL: `${getCoreEndpoint()}/oauth/register-user`,
        body,
    });
};

export const registerUserV2 = async (body: RegisterUserV2Body, email?: boolean): Promise<UserView> => {
    return executeRelayRequest<UserView, RegisterUserV2Body>({
        method: 'POST',
        baseURL: `${getCoreEndpoint()}/oauth/register-user-v2`,
        params: email !== undefined ? { email: email ? 'true' : 'false' } : undefined,
        body,
    });
};

export const login = async (body: LoginUserBody, email?: boolean): Promise<UserTokenView> => {
    return executeRelayRequest<UserTokenView, LoginUserBody>({
        method: 'POST',
        baseURL: `${getCoreEndpoint()}/oauth/login-user`,
        params: { token: 1, ...(email !== undefined && { email: email ? 'true' : 'false' }) },
        body,
    });
};

export const issueCloudToken = async (baseURL: string, body: CloudExchangeTokenBody): Promise<UserTokenView> => {
    return executeSignedRelayRequest<UserTokenView, CloudExchangeTokenBody>({
        method: 'POST',
        baseURL: `${baseURL}/oauth/exchange-token`,
        body: { ...body },
    });
};

export const refreshCloudToken = async ({
    baseURL,
    token,
    target,
}: {
    baseURL: string;
    token: UserTokenView;
    target?: string;
}): Promise<UserTokenView> => {
    if (!token?.Token) throw new Error('No cloud token found');

    const { authId, accountId, identityId, identityToken } = token.Token;
    if (!authId || !accountId || !identityId || !identityToken) {
        throw new Error('Missing token fields for refresh');
    }

    const current = new Date().toISOString();
    const signature = calcSignature({ authId, accountId, identityId, identityToken: '' }, current);
    const body: OAuthRefreshBody = { current, signature, ...(target && { target }) };

    return executeCloudRequest<UserTokenView, OAuthRefreshBody>({
        method: 'POST',
        baseURL: `${baseURL}/oauth/${authId}/refresh`,
        params: { token: 1 },
        body,
    });
};

export const findAlias = async (body: FindAliasBody): Promise<FindAliasView> => {
    return executeRelayRequest<FindAliasView, FindAliasBody>({
        method: 'POST',
        baseURL: `${getCoreEndpoint()}/oauth/find-alias`,
        body,
    });
};

export const verifyAlias = async (body: VerifyAliasBody): Promise<VerifyAliasView> => {
    return executeRelayRequest<VerifyAliasView, VerifyAliasBody>({
        method: 'POST',
        baseURL: `${getCoreEndpoint()}/oauth/verify-alias`,
        body,
    });
};

export const generateToken = async (request: TokenGenerateRequest): Promise<TokenGenerateResponse> => {
    return executeSignedRelayRequest<TokenGenerateResponse, TokenGenerateRequest>({
        method: 'POST',
        baseURL: `${getOAuthEndpoint()}/auth/0/generate-token`,
        body: request,
    });
};

/**
 * Fetches the active relay user's profile (GET /users/0/profile) with auth-error retry.
 */
export const fetchProfile = async (): Promise<UserProfile$> => {
    return await withRetry(
        async () => {
            const { data } = await webTransport
                .buildSignedRequest({
                    method: 'GET',
                    baseURL: `${getOAuthEndpoint()}/users/0/profile`,
                })
                .execute<UserProfile$ & { error?: string }>();
            return throwIfApiError(data);
        },
        MAX_RETRIES,
        'Profile fetch'
    );
};

/**
 * Optimistic profile fetch — no retry / auth-error handling. Meant to run in parallel with a token
 * refresh: returns the profile immediately if the current token is still valid, or null on failure
 * (no alert/redirect).
 */
export const tryFetchProfile = async (): Promise<UserProfile$ | null> => {
    try {
        const { data } = await webTransport
            .buildSignedRequest({
                method: 'GET',
                baseURL: `${getOAuthEndpoint()}/users/0/profile`,
            })
            .execute<UserProfile$ & { error?: string }>();
        return data?.error ? null : data;
    } catch {
        return null;
    }
};

/**
 * Updates the relay user's profile (PUT /users/{uid}) with auth-error retry.
 */
export const updateProfile = async (uid: string, body: Record<string, unknown>) => {
    const endpoint = getDynamicRelayBackend();
    return withRetry(
        async () => {
            const { data } = await webTransport
                .buildSignedRequest({
                    method: 'PUT',
                    baseURL: `${endpoint}/users/${uid}`,
                })
                .setBody(body as Record<string, unknown>)
                .execute<UserProfile$ & { error?: string }>();
            return throwIfApiError(data);
        },
        MAX_RETRIES,
        'Profile update'
    );
};

/**
 * Register with invite code
 * - Uses POST /oauth/login-invite endpoint
 * - Code format: invt:<id>:<code>
 * - Sends { code, delegatorId } in request body
 * - Returns response with Token.identityToken for JWT-based auth
 *
 * NOTE: Uses getDynamicDOUEndpoint() instead of static DOU_ENDPOINT
 * to support deeplink flows where _backend param is set after module load.
 *
 * @param code - Invite code (format: invt:<id>:<code>)
 * @param delegatorId - UID of the user accepting the invite (profile.uid)
 * @param backend - Optional backend endpoint override from deeplink
 * @returns Promise resolving to login response with identityToken
 */
export const registerUserWithInviteCode = async (
    code: string,
    delegatorId: string,
    backend?: string
): Promise<UserTokenView> => {
    const endpoint = backend ?? getDynamicRelayBackend();
    const { data } = await webTransport
        .buildRequest({
            method: 'POST',
            baseURL: `${endpoint}/oauth/login-invite`,
        })
        .setBody({ code, delegatorId })
        .execute<UserTokenView & { error?: string }>();

    return throwIfApiError(data);
};

/**
 * Refreshes the active relay OAuth token and optionally switches the active relay site.
 *
 * When `target` is provided, the backend issues a token scoped to the requested `uid@sid`
 * site session and the refreshed credentials are written back into the web transport.
 */
export const refreshAuthToken = async (target?: string) => {
    const { current, signature, authId, originToken } = await webTransport.getTokenSignature();
    if (!authId || !originToken || !signature || !originToken.identityToken) {
        throw new Error('Missing required token information');
    }

    return withRetry(
        async () => {
            const response = await webTransport
                .buildSignedRequest({
                    method: 'POST',
                    baseURL: `${getOAuthEndpoint()}/oauth/${authId}/refresh`,
                })
                .setParams({ token: 1 })
                .setBody({ current, signature, ...(target ? { target } : {}) })
                .execute<UserTokenView & { error?: string }>();

            throwIfApiError(response.data);

            // Return the full relay token view (profile fields + Token) so callers can derive the
            // session profile from the refresh response — no separate `/users/0/profile` GET.
            const view = response.data as UserTokenView;
            const token = view.Token
                ? ({ identityPoolId: originToken.identityPoolId, ...view.Token } as UserTokenView['Token'])
                : view.Token;
            const nextView = { ...view, Token: token } as UserTokenView;
            // Throws if the identityToken is missing from the refresh response.
            validateTokenResponse(nextView.Token ?? nextView);
            return nextView;
        },
        MAX_RETRIES,
        'Token refresh'
    );
};

export const fetchInviteInfoWithCode = async (code: string, backend: string): Promise<MyInviteView> => {
    const { data } = await webTransport
        .buildSignedRequest({
            method: 'GET',
            baseURL: `${backend}/hello/invite-code`,
        })
        .setParams({ code })
        .execute<MyInviteView & { error?: string }>();

    return throwIfApiError(data);
};

const validateTokenResponse = (tokenData: any): LemonOAuthToken => {
    const token = tokenData?.Token;
    const tokenIdentityToken = token?.identityToken;
    const responseIdentityToken = tokenData?.identityToken;

    const identityToken = tokenIdentityToken || responseIdentityToken;
    if (!identityToken) {
        throw new Error('INVALID_TOKEN: identityToken is missing from refresh response');
    }

    return tokenData;
};
