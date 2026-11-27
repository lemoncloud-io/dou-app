import { redactQueryString, sanitizeReportUrl } from './reportUrl';

describe('redactQueryString', () => {
    it('파라미터 이름은 남기고 값만 가린다', () => {
        expect(redactQueryString('?state=abc123&token=xyz')).toBe('?state=[REDACTED]&token=[REDACTED]');
    });

    it('초대 code는 값을 그대로 남긴다 — 어느 초대였는지 없으면 추적이 안 된다', () => {
        expect(redactQueryString('?code=inv-123&provider=invite')).toBe('?code=inv-123&provider=[REDACTED]');
    });

    it('선행 물음표가 없어도 같게 동작한다', () => {
        expect(redactQueryString('state=abc123')).toBe('?state=[REDACTED]');
    });

    it('같은 키가 반복되면 하나로 접는다', () => {
        expect(redactQueryString('?a=1&a=2')).toBe('?a=[REDACTED]');
        expect(redactQueryString('?code=first&code=second')).toBe('?code=first');
    });

    it('파라미터가 없으면 빈 문자열이다', () => {
        expect(redactQueryString('')).toBe('');
    });

    it('값 없는 플래그 파라미터도 이름은 남긴다', () => {
        expect(redactQueryString('?relay')).toBe('?relay=[REDACTED]');
    });

    it('보존하는 code 값은 다시 인코딩해서 싣는다', () => {
        expect(redactQueryString('?code=a%2Bb%20c')).toBe('?code=a%2Bb%20c');
    });
});

describe('sanitizeReportUrl', () => {
    it('경로는 그대로, 쿼리 값은 가린다', () => {
        expect(sanitizeReportUrl('https://app.test/auth/callback?state=abc&token=xyz')).toBe(
            'https://app.test/auth/callback?state=[REDACTED]&token=[REDACTED]'
        );
    });

    it('초대 링크는 code를 살려서 남긴다', () => {
        expect(sanitizeReportUrl('https://app.test/invite/accept?code=inv-123&provider=invite')).toBe(
            'https://app.test/invite/accept?code=inv-123&provider=[REDACTED]'
        );
    });

    it('쿼리가 없으면 원문 그대로다', () => {
        expect(sanitizeReportUrl('https://app.test/channels/abc')).toBe('https://app.test/channels/abc');
    });

    it('프래그먼트는 통째로 버린다 — 토큰이 실릴 수 있는 자리다', () => {
        expect(sanitizeReportUrl('https://app.test/cb#access_token=xyz')).toBe('https://app.test/cb');
    });

    it('쿼리와 프래그먼트가 함께 있으면 쿼리만 가려 남긴다', () => {
        expect(sanitizeReportUrl('https://app.test/s?code=abc#tail')).toBe('https://app.test/s?code=abc');
    });

    it('프래그먼트 안의 물음표를 쿼리로 오인하지 않는다', () => {
        expect(sanitizeReportUrl('https://app.test/p#/x?token=abc')).toBe('https://app.test/p');
    });

    it('상대 경로도 같은 규칙으로 처리한다', () => {
        expect(sanitizeReportUrl('/?code=abc&_backend=https://api.test')).toBe('/?code=abc&_backend=[REDACTED]');
    });
});
