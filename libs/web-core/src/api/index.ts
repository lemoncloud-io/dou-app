import { OAUTH_ENDPOINT, webCore } from '../core';
import { MAX_RETRIES, validateTokenResponse, withRetry } from '../utils';

import type { UserProfile } from '../stores';
import type { LemonOAuthToken, RefreshTokenBody } from '@lemoncloud/lemon-web-core';

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
        .execute<{ Token: LemonOAuthToken }>();

    return await webCore.buildCredentialsByToken(data.Token);
};

export const refreshAuthToken = async () => {
    return withRetry(
        async () => {
            const { current, signature, authId, originToken } = await webCore.getTokenSignature();
            if (!authId || !originToken || !signature || !originToken.identityToken) {
                throw new Error('Missing required token information');
            }

            const body: RefreshTokenBody = { current, signature };
            const response = await webCore
                .buildSignedRequest({
                    method: 'POST',
                    baseURL: `${OAUTH_ENDPOINT}/oauth/${authId}/refresh`,
                })
                .setBody({ ...body })
                .execute<LemonOAuthToken>();

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
                .execute<UserProfile>();
            return data;
        },
        MAX_RETRIES,
        'Profile fetch'
    );
};

export const updateProfile = async (body: Partial<UserProfile>) => {
    try {
        return await withRetry(
            async () => {
                const { data } = await webCore
                    .buildSignedRequest({
                        method: 'PUT',
                        baseURL: `${OAUTH_ENDPOINT}/users/0/profile`,
                    })
                    .setBody({ ...body })
                    .execute<UserProfile>();
                return data;
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
            console.log('Profile fetch got 403, attempting token refresh...');
            try {
                await refreshAuthToken();
                // Retry profile fetch once after successful token refresh
                return await withRetry(
                    async () => {
                        const { data } = await webCore
                            .buildSignedRequest({
                                method: 'PUT',
                                baseURL: `${OAUTH_ENDPOINT}/users/0/profile`,
                            })
                            .setBody({ ...body })
                            .execute<UserProfile>();
                        return data;
                    },
                    1,
                    'Profile update after token refresh'
                );
            } catch (refreshError) {
                console.error('Token refresh failed during profile fetch:', refreshError);
                throw error;
            }
        }
        throw error;
    }
};
