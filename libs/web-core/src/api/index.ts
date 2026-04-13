import { ENV, getDynamicDOUEndpoint, OAUTH_ENDPOINT, webCore } from '../core';
import { MAX_RETRIES, validateTokenResponse, withRetry } from '../utils';

const throwIfApiError = <T>(data: T & { error?: string }): T => {
    if (data.error) throw new Error(data.error);
    return data;
};

import type { UserProfile$ as UserProfile } from '@lemoncloud/chatic-backend-api';
import type { LemonRefreshTokenResult, VerifyNativeTokenBody } from '../types';
import type { LemonOAuthToken } from '@lemoncloud/lemon-web-core';

// ============================================================================
// Error Report Types & API
// @see clipbiz-backend-api@0.26.103
// ============================================================================

export type AppType = 'web' | 'admin' | 'mobile';

/**
 * 에러 상세 정보 (message에 JSON string으로 전달)
 */
export interface ErrorReportPayload {
    message: string;
    stack?: string;
    componentStack?: string;
    app: AppType;
    env: string;
    url: string;
    timestamp: string;
    userId?: string;
    userAgent?: string;
}

/**
 * POST /d1/hello/report Body
 * @see SlackReportBody from clipbiz-backend-api
 */
interface SlackReportBody {
    title?: string;
    message: string;
}

// TODO: chatic 백엔드에 /d1/hello/report 엔드포인트 구현 후 OAUTH_ENDPOINT 교체 필요
const ERROR_REPORT_ENDPOINT = `${OAUTH_ENDPOINT}/d1/hello/report`;

export const reportError = async (
    error: Error,
    errorInfo: { componentStack?: string },
    app: AppType,
    userId?: string
): Promise<void> => {
    // NOTE: add report error
    return;

    try {
        const payload: ErrorReportPayload = {
            message: error.message,
            stack: error.stack,
            componentStack: errorInfo.componentStack,
            app,
            env: ENV,
            url: window.location.href,
            timestamp: new Date().toISOString(),
            userId,
            userAgent: navigator.userAgent,
        };

        const body: SlackReportBody = {
            title: `${app}-error`,
            message: JSON.stringify(payload, null, 2),
        };

        await webCore
            .buildSignedRequest({
                method: 'POST',
                baseURL: ERROR_REPORT_ENDPOINT,
            })
            .setBody(body)
            .execute();
    } catch (reportingError) {
        console.error('Failed to report error:', reportingError);
    }
};

// ============================================================================
// Auth APIs
// ============================================================================

export const snsTestLogin = async (tokenBody: VerifyNativeTokenBody) => {
    const { data } = await webCore
        .buildSignedRequest({ method: 'POST', baseURL: `${OAUTH_ENDPOINT}/oauth/0/verify-native-token` })
        .setParams({ token: 1 })
        .setBody(tokenBody)
        .execute<LemonRefreshTokenResult & { error?: string }>();

    throwIfApiError(data);

    const refreshToken: LemonOAuthToken = {
        ...data.Token,
        identityToken: data.Token.identityToken,
    };

    await webCore.buildCredentialsByToken(refreshToken);

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
    const { data } = await webCore
        .buildSignedRequest({
            method: 'POST',
            baseURL: `${OAUTH_ENDPOINT}/oauth/${provider}/token`,
        })
        .setBody({ code })
        .execute<{ Token: LemonOAuthToken } & { error?: string }>();

    throwIfApiError(data);

    return await webCore.buildCredentialsByToken(data.Token);
};

/**
 * Login invite response type
 */
export interface LoginInviteResponse {
    id: string;
    name: string;
    code: string;
    userRole: string;
    userStatus: string;
    Token: {
        authId: string;
        accountId: string;
        identityId: string;
        identityPoolId: string;
        identityToken: string;
    };
}

/**
 * Login with invite code
 * - Uses POST /oauth/login-invite endpoint
 * - Code format: invt:<id>:<code>
 * - Returns response with Token.identityToken for JWT-based auth
 *
 * NOTE: Uses getDynamicDOUEndpoint() instead of static DOU_ENDPOINT
 * to support deeplink flows where _backend param is set after module load.
 *
 * @param code - Invite code (format: invt:<id>:<code>)
 * @returns Promise resolving to login response with identityToken
 */
export const loginWithInviteCode = async (code: string, backend?: string): Promise<LoginInviteResponse> => {
    const endpoint = backend ?? getDynamicDOUEndpoint();
    const { data } = await webCore
        .buildSignedRequest({
            method: 'POST',
            baseURL: `${endpoint}/oauth/login-invite`,
        })
        .setBody({ code })
        .execute<LoginInviteResponse & { error?: string }>();

    return throwIfApiError(data);
};

export const refreshAuthToken = async () => {
    return withRetry(
        async () => {
            const { current, signature, authId, originToken } = await webCore.getTokenSignature();
            if (!authId || !originToken || !signature || !originToken.identityToken) {
                throw new Error('Missing required token information');
            }

            const response = await webCore
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
            await webCore.buildCredentialsByToken(validatedToken);
        },
        MAX_RETRIES,
        'Token refresh'
    );
};

export const fetchProfile = async () => {
    return await withRetry(
        async () => {
            const { data } = await webCore
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

export const updateProfile = async (uid: string, body: Record<string, unknown>) => {
    const endpoint = getDynamicDOUEndpoint();

    try {
        return await withRetry(
            async () => {
                const { data } = await webCore
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
            console.log('Profile update got 403, attempting token refresh...');
            try {
                await refreshAuthToken();
                // Retry profile update once after successful token refresh
                return await withRetry(
                    async () => {
                        const { data } = await webCore
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
                console.error('Token refresh failed during profile update:', refreshError);
                throw error;
            }
        }
        throw error;
    }
};
