import { redactText } from './valuePatterns';

describe('redactText — 모양으로 마스킹한다', () => {
    it('이메일 주소를 [EMAIL]로 바꾼다', () => {
        expect(redactText('alias lookup failed for someone@user.test')).toBe('alias lookup failed for [EMAIL]');
        expect(redactText('a.b+tag@sub.example.co.kr')).toBe('[EMAIL]');
    });

    it('JWT를 [JWT]로 바꾼다', () => {
        const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MSJ9.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk';
        expect(redactText(`401 UNAUTHORIZED - ${jwt}`)).toBe('401 UNAUTHORIZED - [JWT]');
    });

    it('Bearer 토큰은 스킴을 남기고 값만 가린다', () => {
        expect(redactText('authorization: Bearer abcdef1234567890')).toBe('authorization: Bearer [TOKEN]');
    });

    it('FCM 등록 토큰과 AWS 액세스 키를 [TOKEN]으로 바꾼다', () => {
        expect(redactText('token=fMxZ1s9k:APA91bHqRs0dQxT7vWnLpYzB3cKmJ4eR5uG')).toBe('token=[TOKEN]');
        expect(redactText('AKIAIOSFODNN7EXAMPLE denied')).toBe('[TOKEN] denied');
    });

    it('전화번호를 형태별로 [PHONE]으로 바꾼다', () => {
        expect(redactText('to=+821012345678')).toBe('to=[PHONE]');
        expect(redactText('010-1234-5678 실패')).toBe('[PHONE] 실패');
        expect(redactText('01012345678')).toBe('[PHONE]');
    });

    it('한 문자열 안의 여러 값을 모두 바꾼다', () => {
        expect(redactText('someone@user.test / +821012345678')).toBe('[EMAIL] / [PHONE]');
    });

    /**
     * 이 앱은 쿼리스트링에 capability 재료를 싣는다 — `routeTrail`의 보안 주석이 그 규칙을 이미
     * 적어 뒀다(`/invite/accept?…`, `/s?…`). 그런데 URL을 통째로 message에 싣는 엔트리가
     * 네이티브에 여섯 곳 있었다.
     */
    describe('URL 쿼리는 이름만 남기고 값을 가린다', () => {
        it('절대 URL의 쿼리 값을 가리고 파라미터 이름은 남긴다', () => {
            expect(redactText('url=https://app.dou.io/invite/accept?code=abc123&token=xyz')).toBe(
                'url=https://app.dou.io/invite/accept?code=[REDACTED]&token=[REDACTED]'
            );
        });

        it('scheme만 있는 URL도 처리한다 — sms 본문과 수신번호가 같이 나가던 자리다', () => {
            expect(redactText('Cannot open SMS URL: sms:01012345678,01087654321?body=hello%20there')).toBe(
                'Cannot open SMS URL: sms:[PHONE],[PHONE]?body=[REDACTED]'
            );
        });

        it('상대 경로의 쿼리도 가린다', () => {
            expect(redactText('navigate to /s?k=shortcode')).toBe('navigate to /s?k=[REDACTED]');
        });

        // 프래그먼트는 key=value 형태가 보장되지 않는다 — 인증 플로우가 맨 토큰을 거기 둔다.
        it('프래그먼트는 통째로 가린다', () => {
            expect(redactText('chatic://open/chat?cid=c1#access_token=secret')).toBe(
                'chatic://open/chat?cid=[REDACTED]#[REDACTED]'
            );
            expect(redactText('https://app.dou.io/chat/ch-1#top')).toBe('https://app.dou.io/chat/ch-1#[REDACTED]');
        });

        it('같은 이름이 반복되면 한 번으로 접는다', () => {
            expect(redactText('/x?a=1&a=2&b=3')).toBe('/x?a=[REDACTED]&b=[REDACTED]');
        });

        it('쿼리가 없는 URL은 건드리지 않는다 — 경로는 이미 리포트가 싣는 불투명 id다', () => {
            expect(redactText('GET https://api.dou.io/hello/report-bulk')).toBe(
                'GET https://api.dou.io/hello/report-bulk'
            );
        });

        it('URL이 아닌 물음표는 건드리지 않는다', () => {
            expect(redactText('실패했나요? 다시 시도합니다')).toBe('실패했나요? 다시 시도합니다');
            expect(redactText('check /settings? maybe')).toBe('check /settings? maybe');
        });
    });

    /**
     * 과잉 마스킹 방지. 여기 있는 값들은 전부 추적의 조인 축이거나 진단 필드다 — 무작위해
     * 보인다고 지우면 로그를 모으는 이유 자체가 없어진다.
     */
    describe('지우면 안 되는 것은 그대로 둔다', () => {
        it('uuid·복합 id·runId는 건드리지 않는다', () => {
            const ids = [
                '9f8e7d6c-5b4a-4321-9876-0123456789ab',
                'ch_01H9Z@usr_01H9Y',
                'run-1757462400000',
                '1757462400000',
            ];
            for (const id of ids) expect(redactText(id)).toBe(id);
        });

        it('상태 코드·버전·URL 경로는 건드리지 않는다', () => {
            expect(redactText('404 NOT FOUND - relay.request(join.get)')).toBe(
                '404 NOT FOUND - relay.request(join.get)'
            );
            expect(redactText('v0.59.0 / GET /hello/report-bulk')).toBe('v0.59.0 / GET /hello/report-bulk');
        });

        it('일치가 없으면 같은 문자열을 그대로 돌려준다', () => {
            const text = 'reconnect attempt failed';
            expect(redactText(text)).toBe(text);
        });
    });
});
