import hmacSHA256 from 'crypto-js/hmac-sha256.js';
import encBase64 from 'crypto-js/enc-base64.js';

import type { AuthSignResult, IAuthSigner, SignatureContext, SignaturePayload } from '../contracts';

const hmac = (message: string, key: string): string => encBase64.stringify(hmacSHA256(message, key));

/**
 * lemon HMAC — `hmac(hmac(hmac(data, authId), accountId), identityId)`,
 * `data = [current, accountId, identityId, '', userAgent].join('&')`. The 4th slot is always `''`:
 * this is not a caller convention, it is invariant to the formula itself (both the pre-lib web-core
 * copy and lemon-web-core's own `calcSignature` hardcode it — see docs/architecture.md §서명식).
 * `payload.identityToken` is kept for call-site compatibility but is never read.
 *
 * Pure — no network, no storage, no globals. `current`/`userAgent` are required inputs (the
 * pre-lib version defaulted them to `new Date().toISOString()`/`navigator.userAgent`, which made it
 * unusable outside a browser — see 설계 원칙 "전역 읽기 금지").
 */
export class LemonHmacSigner implements IAuthSigner {
    sign(payload: SignaturePayload, context: SignatureContext): AuthSignResult {
        const data = [context.current, payload.accountId, payload.identityId, '', context.userAgent].join('&');
        const signature = hmac(hmac(hmac(data, payload.authId), payload.accountId), payload.identityId);
        return { signature, current: context.current };
    }
}
