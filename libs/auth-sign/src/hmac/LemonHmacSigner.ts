import hmacSHA256 from 'crypto-js/hmac-sha256.js';
import encBase64 from 'crypto-js/enc-base64.js';

import type { AuthSignResult, IAuthSigner, SignatureContext, SignaturePayload } from '../contracts';

const hmac = (message: string, key: string): string => encBase64.stringify(hmacSHA256(message, key));

/**
 * lemon HMAC — `hmac(hmac(hmac(data, authId), accountId), identityId)`, where
 * `data = [current, accountId, identityId, '', userAgent].join('&')`.
 *
 * The 4th slot is always `''`. That is a property of the formula and not a caller convention, so
 * `payload.identityToken` is accepted and never read.
 *
 * Pure: no network, no storage, no globals. `current` and `userAgent` are required inputs rather
 * than defaults, because a default would have to read `new Date()` or `navigator`, and this lib
 * runs under Node and React Native as well as a browser.
 */
export class LemonHmacSigner implements IAuthSigner {
    sign(payload: SignaturePayload, context: SignatureContext): AuthSignResult {
        const data = [context.current, payload.accountId, payload.identityId, '', context.userAgent].join('&');
        const signature = hmac(hmac(hmac(data, payload.authId), payload.accountId), payload.identityId);
        return { signature, current: context.current };
    }
}
