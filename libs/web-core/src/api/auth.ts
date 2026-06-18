import { cloudCore, OAUTH_ENDPOINT } from '../core';
import { calcSignature, MAX_RETRIES, validateTokenResponse, withRetry } from './utils';
import {
    executeCloudRequest,
    executeRelayRequest,
    executeSignedRelayRequest,
    getCoreEndpoint,
    getOAuthEndpoint,
} from './utils/request';

import type {
    CloudExchangeTokenBody,
    LoginUserBody,
    RegisterUserV2Body,
    UserBody,
    UserLogoutResult,
    UserTokenView,
    UserView,
} from '@lemoncloud/chatic-backend-api';
import type {
    OAuthRefreshBody,
    VerifyNativeTokenBody,
} from '@lemoncloud/chatic-backend-api/dist/modules/auth/oauth2/oauth2-types';
import type { TokenGenerateRequest, TokenGenerateResponse } from '@chatic/shared';
import { throwIfApiError } from '@chatic/shared';

import type { FindAliasBody, FindAliasView, LemonRefreshTokenResult, VerifyAliasBody, VerifyAliasView } from './types';
import { getDynamicRelayBackend, webTransport } from '../transport';
import type { LemonOAuthToken } from '@lemoncloud/lemon-web-core';
import { logger } from '@chatic/bridges';

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

    const existing = cloudCore.getCloudToken();
    const merged = { ...existing, ...refreshed } as UserTokenView;
    cloudCore.saveCloudToken(merged);
    return merged;
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

export const logout = async (): Promise<UserLogoutResult> => {
    return executeRelayRequest<UserLogoutResult, Record<string, never>>({
        method: 'POST',
        baseURL: `${getCoreEndpoint()}/users/logout`,
        body: {},
    });
};

export const snsTestLogin = async (tokenBody: VerifyNativeTokenBody) => {
    const { data } = await webTransport
        .buildSignedRequest({ method: 'POST', baseURL: `${OAUTH_ENDPOINT}/oauth/0/verify-native-token` })
        .setParams({ token: 1 })
        .setBody(tokenBody)
        .execute<LemonRefreshTokenResult & { error?: string }>();

    throwIfApiError(data);

    const refreshToken: LemonOAuthToken = {
        ...data.Token,
        identityToken: data.Token.identityToken,
    };

    await webTransport.buildCredentialsByToken(refreshToken);

    return data;
};

/**
 * Creates authentication credentials using OAuth provider
 * - Exchanges authorization code for access token
 * - Builds credentials using the obtained token
 *
 * @param provider - OAuth provider name (default: 'google')
 * @param code - Authorization code from OAuth flow
 * @returns Promise resolving to authentication credentials
 */
export const createCredentialsByProvider = async (provider = 'google', code: string) => {
    const { data } = await webTransport
        .buildSignedRequest({
            method: 'POST',
            baseURL: `${OAUTH_ENDPOINT}/oauth/${provider}/token`,
        })
        .setBody({ code })
        .execute<{ Token: LemonOAuthToken } & { error?: string }>();

    throwIfApiError(data);

    return await webTransport.buildCredentialsByToken(data.Token);
};

/**
 * Login with invite code
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
export const loginWithInviteCode = async (
    code: string,
    delegatorId: string,
    backend?: string
): Promise<UserTokenView> => {
    const endpoint = backend ?? getDynamicRelayBackend();
    const { data } = await webTransport
        .buildSignedRequest({
            method: 'POST',
            baseURL: `${endpoint}/oauth/login-invite`,
        })
        .setBody({ code, delegatorId })
        .execute<UserTokenView & { error?: string }>();

    return throwIfApiError(data);
};

export const refreshAuthToken = async () => {
    return withRetry(
        async () => {
            const { current, signature, authId, originToken } = await webTransport.getTokenSignature();
            if (!authId || !originToken || !signature || !originToken.identityToken) {
                throw new Error('Missing required token information');
            }

            const response = await webTransport
                .buildSignedRequest({
                    method: 'POST',
                    baseURL: `${OAUTH_ENDPOINT}/oauth/${authId}/refresh`,
                })
                .setParams({ token: 1 })
                .setBody({ current, signature })
                .execute<LemonOAuthToken & { error?: string }>();

            throwIfApiError(response.data);

            const tokenData = {
                identityPoolId: originToken.identityPoolId,
                ...(response.data.Token ? response.data.Token : response.data),
            };
            const validatedToken: LemonOAuthToken = validateTokenResponse(tokenData);
            await webTransport.buildCredentialsByToken(validatedToken);
        },
        MAX_RETRIES,
        'Token refresh'
    );
};

export const fetchProfile = async () => {
    return await withRetry(
        async () => {
            const { data } = await webTransport
                .buildSignedRequest({
                    method: 'GET',
                    baseURL: `${OAUTH_ENDPOINT}/users/0/profile`,
                })
                .execute<UserProfile & { error?: string }>();
            return throwIfApiError(data);
        },
        MAX_RETRIES,
        'Profile fetch'
    );
};

/**
 * 낙관적 프로필 조회 — retry/auth error handling 없음.
 * 토큰 갱신과 병렬 실행용: 현재 토큰이 아직 유효하면 즉시 프로필 반환.
 * 실패 시 null 반환 (alert/redirect 없음).
 */
export const tryFetchProfile = async (): Promise<UserProfile | null> => {
    try {
        const { data } = await webTransport
            .buildSignedRequest({
                method: 'GET',
                baseURL: `${OAUTH_ENDPOINT}/users/0/profile`,
            })
            .execute<UserProfile & { error?: string }>();
        return data?.error ? null : data;
    } catch {
        return null;
    }
};

class UserProfile {}

export const updateProfile = async (uid: string, body: Record<string, unknown>) => {
    const endpoint = getDynamicRelayBackend();

    try {
        return await withRetry(
            async () => {
                const { data } = await webTransport
                    .buildSignedRequest({
                        method: 'PUT',
                        baseURL: `${endpoint}/users/${uid}`,
                    })
                    .setBody(body as Record<string, unknown>)
                    .execute<UserProfile & { error?: string }>();
                return throwIfApiError(data);
            },
            MAX_RETRIES,
            'Profile update'
        );
    } catch (error: any) {
        const is403 =
            error?.status === 403 ||
            error?.response?.status === 403 ||
            (error?.message && error.message.includes('403'));

        if (is403) {
            logger.info('PROFILE', 'Profile update got 403, attempting token refresh');
            try {
                await refreshAuthToken();
                // Retry profile update once after successful token refresh
                return await withRetry(
                    async () => {
                        const { data } = await webTransport
                            .buildSignedRequest({
                                method: 'PUT',
                                baseURL: `${endpoint}/dou-d1/users/${uid}`,
                            })
                            .setBody(body as Record<string, unknown>)
                            .execute<UserProfile & { error?: string }>();
                        return throwIfApiError(data);
                    },
                    1,
                    'Profile update after token refresh'
                );
            } catch (refreshError) {
                logger.error('PROFILE', 'Token refresh failed during profile update', { error: refreshError });
                throw error;
            }
        }
        throw error;
    }
};
