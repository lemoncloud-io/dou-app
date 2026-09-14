import { isSensitiveField, isSensitiveKey } from './sensitiveKeys';

describe('isSensitiveKey — 이름으로 판정한다', () => {
    it('비밀을 담는 이름을 잡는다', () => {
        for (const key of ['password', 'identityToken', 'Authorization', 'x-amz-security-token', 'code', 'alias']) {
            expect(isSensitiveKey(key)).toBe(true);
        }
    });

    /**
     * 부분일치가 기본값인 건 맞다 — 새로 생긴 `sessionToken2`가 목록을 안 고쳐도 걸린다. 문제는
     * `code`다: 목록에 있어야 하는 이름이면서(1회용 인증코드) 진단의 핵심 필드 이름들과 겹친다.
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
     * 이 플래그들은 **값을 안 싣기 위해** 일부러 만든 필드다. 지우면 비밀을 안 실은 대가로 얻은
     * 것까지 함께 사라지고, 남은 `[REDACTED]`는 비밀이 실렸던 것처럼 보인다.
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
