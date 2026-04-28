import { DOU_ENDPOINT, ENV, getDynamicDOUEndpoint, OAUTH_ENDPOINT, webCore, cloudCore } from '../core';
import { MAX_RETRIES, validateTokenResponse, withRetry } from '../utils';
import { useWebCoreStore } from '../stores';

import { getMobileAppInfo } from '@chatic/app-messages';

const throwIfApiError = <T>(data: T & { error?: string }): T => {
    if (data.error) throw new Error(data.error);
    return data;
};

import type { UserProfile$ as UserProfile, UserTokenView, SlackReportBody } from '@lemoncloud/chatic-backend-api';
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
    // 에러 정보
    message: string;
    stack?: string;
    componentStack?: string;
    // 환경
    app: AppType;
    env: string;
    url: string;
    timestamp: string;
    userAgent?: string;
    // 유저
    user: {
        uid?: string;
        name?: string;
        role?: string;
        isAuthenticated: boolean;
        isGuest: boolean;
        isCloudUser: boolean;
        isInvited: boolean;
    };
    // 클라우드
    cloud: {
        connected: boolean;
        cloudId?: string;
        name?: string;
        backend?: string;
        placeId?: string;
    };
    // HTTP 에러 정보
    http?: {
        status?: number;
        statusText?: string;
        code?: string;
        responseData?: unknown;
    };
    // 디바이스 (모바일 전용)
    device?: {
        platform?: string;
        appVersion?: string;
        deviceModel?: string;
    };
    // 네트워크
    network: {
        online: boolean;
    };
}

// TODO: chatic 백엔드에 /d1/hello/report 엔드포인트 구현 후 OAUTH_ENDPOINT 교체 필요
const ERROR_REPORT_ENDPOINT = `${DOU_ENDPOINT}/hello/report`;

// Throttling: 동일 에러 메시지는 60초 내 1회만 리포트
const THROTTLE_WINDOW_MS = 60_000;
const recentErrors = new Map<string, number>();

export const reportError = async (error: Error, errorInfo?: { componentStack?: string }): Promise<void> => {
    const throttleKey = error.message;
    const now = Date.now();
    const lastReported = recentErrors.get(throttleKey);
    if (lastReported && now - lastReported < THROTTLE_WINDOW_MS) {
        console.warn('[ErrorReport] Throttled (duplicate within 60s):', throttleKey);
        return;
    }
    recentErrors.set(throttleKey, now);

    // 오래된 항목 정리 (메모리 누수 방지)
    if (recentErrors.size > 100) {
        for (const [key, ts] of recentErrors) {
            if (now - ts > THROTTLE_WINDOW_MS) recentErrors.delete(key);
        }
    }

    try {
        // 앱 타입 자동 감지
        const { isOnMobileApp } = getMobileAppInfo();
        const app: AppType = isOnMobileApp ? 'mobile' : 'web';

        // 유저 정보 (useWebCoreStore에서)
        const state = useWebCoreStore.getState();
        const userRole = (state.profile?.$user as any)?.userRole;

        // 클라우드 정보 (cloudCore에서)
        const cloudToken = cloudCore.getCloudToken();
        const backend = cloudCore.getBackend();
        const hasCloud = !!cloudToken && !!backend;

        // HTTP 에러 정보 추출
        const err = error as any;
        const httpStatus = err?.status || err?.response?.status || err?.statusCode;
        const httpInfo = httpStatus
            ? {
                  status: httpStatus,
                  statusText: err?.statusText || err?.response?.statusText,
                  code: err?.code,
                  responseData: err?.response?.data,
              }
            : err?.code
              ? { code: err.code }
              : undefined;

        // 디바이스 정보 (모바일 WebView 주입값)
        const w = window as any;

        const payload: ErrorReportPayload = {
            message: error.message,
            stack: error.stack,
            componentStack: errorInfo?.componentStack,
            app,
            env: ENV,
            url: window.location.href,
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
            user: {
                uid: state.profile?.uid,
                name: state.profile?.$user?.name,
                role: userRole,
                isAuthenticated: state.isAuthenticated,
                isGuest: state.isGuest,
                isCloudUser: state.isCloudUser,
                isInvited: state.isInvited,
            },
            cloud: {
                connected: hasCloud,
                cloudId: hasCloud ? (cloudCore.getSelectedCloudId() ?? undefined) : undefined,
                name: hasCloud ? (cloudToken?.name ?? undefined) : undefined,
                backend: hasCloud ? (backend ?? undefined) : undefined,
                placeId: cloudCore.getSelectedPlaceId() ?? undefined,
            },
            http: httpInfo,
            device: isOnMobileApp
                ? {
                      platform: w.CHATIC_APP_PLATFORM,
                      appVersion: w.CHATIC_APP_CURRENT_VERSION,
                      deviceModel: w.CHATIC_APP_DEVICE_MODEL,
                  }
                : undefined,
            network: {
                online: navigator.onLine,
            },
        };

        const body: SlackReportBody = {
            title: `[${app}] error`,
            message: JSON.stringify(payload, null, 2),
            silent: ENV === 'dev',
            save: true,
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

/**
 * 사용자가 직접 이슈를 보고하는 함수
 * reportError와 달리 스로틀링 없음 (사용자 의도적 액션)
 */
export const reportIssue = async (title: string, message: string): Promise<void> => {
    try {
        const { isOnMobileApp } = getMobileAppInfo();
        const app: AppType = isOnMobileApp ? 'mobile' : 'web';

        const state = useWebCoreStore.getState();
        const userRole = (state.profile?.$user as any)?.userRole;

        const cloudToken = cloudCore.getCloudToken();
        const backend = cloudCore.getBackend();
        const hasCloud = !!cloudToken && !!backend;

        const payload = {
            title,
            message,
            app,
            env: ENV,
            url: window.location.href,
            timestamp: new Date().toISOString(),
            user: {
                uid: state.profile?.uid,
                name: state.profile?.$user?.name,
                role: userRole,
                isAuthenticated: state.isAuthenticated,
            },
            cloud: {
                connected: hasCloud,
                cloudId: hasCloud ? (cloudCore.getSelectedCloudId() ?? undefined) : undefined,
                name: hasCloud ? (cloudToken?.name ?? undefined) : undefined,
                placeId: cloudCore.getSelectedPlaceId() ?? undefined,
            },
        };

        const body: SlackReportBody = {
            title: `[${app}] issue: ${title}`,
            message: JSON.stringify(payload, null, 2),
            silent: ENV !== 'prod',
            save: true,
        };

        await webCore
            .buildSignedRequest({
                method: 'POST',
                baseURL: ERROR_REPORT_ENDPOINT,
            })
            .setBody(body)
            .execute();
    } catch (reportingError) {
        console.error('Failed to report issue:', reportingError);
        throw reportingError;
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
    const endpoint = backend ?? getDynamicDOUEndpoint();
    const { data } = await webCore
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
