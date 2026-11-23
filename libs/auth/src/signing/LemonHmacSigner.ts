import hmacSHA256 from 'crypto-js/hmac-sha256.js';
import encBase64 from 'crypto-js/enc-base64.js';

import type { AuthSignResult, IAuthSigner, SignatureContext, SignaturePayload } from './contracts';

const hmac = (message: string, key: string): string => encBase64.stringify(hmacSHA256(message, key));

export class LemonHmacSigner implements IAuthSigner {
    sign(payload: SignaturePayload, context: SignatureContext): AuthSignResult {
        const data = [context.current, payload.accountId, payload.identityId, '', context.userAgent].join('&');
        const signature = hmac(hmac(hmac(data, payload.authId), payload.accountId), payload.identityId);
        return { signature, current: context.current };
    }
}
