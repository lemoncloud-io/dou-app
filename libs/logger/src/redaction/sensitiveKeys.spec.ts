import { isSensitiveField, isSensitiveKey } from './sensitiveKeys';

describe('isSensitiveKey — 이름으로 판정한다', () => {
    it('비밀을 담는 이름을 잡는다', () => {
        for (const key of ['password', 'identityToken', 'Authorization', 'x-amz-security-token', 'code', 'alias']) {
            expect(isSensitiveKey(key)).toBe(true);
        }
    });

    /**
     * Partial matching is the default for good reason — a newly added `sessionToken2` gets
     * caught without touching the list. The problem is `code`: it needs to be on the list (a
     * one-time auth code) while also overlapping with core diagnostic field names.
     */
    it('code로 끝나는 진단 필드는 잡지 않는다', () => {
        for (const key of ['errorCode', 'statusCode', 'httpStatusCode', 'countryCode', 'langCode', 'closeCode']) {
            expect(isSensitiveKey(key)).toBe(false);
        }
    });

    it('그래도 code 자체는 여전히 비밀이다', () => {
        expect(isSensitiveKey('code')).toBe(true);
        expect(isSensitiveKey('verifyCode')).toBe(true);
    });
});

describe('isSensitiveField — 값을 같이 보고 판정한다', () => {
    /**
     * These flags are deliberately made **to avoid carrying the value**. Redacting them would
     * also erase the very thing gained by not carrying the secret, and the leftover
     * `[REDACTED]` would look as though a secret had been carried after all.
     */
    it('boolean 존재 플래그는 통과시킨다', () => {
        for (const key of ['hasToken', 'hasCode', 'hasPassword', 'hasOfferToken', 'hasCachedToken', 'isCredentialed']) {
            expect(isSensitiveField(key, true)).toBe(false);
            expect(isSensitiveField(key, false)).toBe(false);
        }
    });

    it('boolean이 아니면 이름이 has로 시작해도 가린다', () => {
        expect(isSensitiveField('hasToken', 'eyJhbGciOi')).toBe(true);
        expect(isSensitiveField('hasCode', 123456)).toBe(true);
    });

    it('평범한 이름은 값과 무관하게 통과시킨다', () => {
        expect(isSensitiveField('kind', 'relay')).toBe(false);
        expect(isSensitiveField('count', 3)).toBe(false);
    });
});
