import { OAUTH_ENDPOINT } from '../session/core';
import { webTransport } from './webTransport';

import type { VerifyNativeTokenBody } from '@lemoncloud/chatic-backend-api/dist/modules/auth/oauth2/oauth2-types';
import type { LemonOAuthToken } from '@lemoncloud/lemon-web-core';
import type { LemonRefreshTokenResult } from '../api/types';
import { throwIfApiError } from '@chatic/shared';

/**
 * Verifies a native token and applies the returned relay credentials to the transport runtime.
 */
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
 * Exchanges an OAuth authorization code and applies the returned credentials to the transport runtime.
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

    return webTransport.buildCredentialsByToken(data.Token);
};
