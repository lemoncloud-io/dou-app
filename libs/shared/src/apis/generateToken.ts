import { OAUTH_ENDPOINT, webCore } from '@chatic/web-core';

import type { TokenGenerateRequest, TokenGenerateResponse } from '../types';

/**
 * Generate a test JWT token with the provided claims
 *
 * @param request - Token generation request with cid, sid, aid, uid, mid?, gid?
 * @returns Generated JWT token and optional expiration
 */
export const generateToken = async (request: TokenGenerateRequest): Promise<TokenGenerateResponse> => {
    const { data } = await webCore
        .buildSignedRequest({
            method: 'POST',
            baseURL: `${OAUTH_ENDPOINT}/auth/0/generate-token`,
        })
        .setBody(request)
        .execute<TokenGenerateResponse>();

    return data;
};
