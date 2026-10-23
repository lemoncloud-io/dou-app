import { createHmac } from 'crypto';

import { setRedactionSalt } from './fingerprint';
import { redactText } from './valuePatterns';

const SALT = 'device-salt-0123456789';
const fingerprint = (value: string) => createHmac('sha256', SALT).update(value).digest('hex').slice(0, 6);

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
     * This app puts capability material in the query string — `routeTrail`'s security comment
     * already spells out that rule (`/invite/accept?…`, `/s?…`). But there were six places in
     * native where an entry put the whole URL into message.
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

        // A fragment isn't guaranteed to be key=value shaped — auth flows put bare tokens there.
        it('프래그먼트는 통째로 가린다', () => {
            expect(redactText('chatic://open/chat?cid=c1#access_token=secret')).toBe(
                'chatic://open/chat?cid=c1#[REDACTED]'
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
     * Guards against over-masking. Every value here is either a tracing join axis or a
     * diagnostic field — redacting it just because it looks random defeats the whole point of
     * collecting logs.
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

describe('URL query safe list', () => {
    it('keeps the values of the listed parameters and masks the rest', () => {
        expect(redactText('open /chat?cid=1000002&sid=s1&v=1.2.3&tab=home&k=secret')).toBe(
            'open /chat?cid=1000002&sid=s1&v=1.2.3&tab=home&k=[REDACTED]'
        );
    });

    it('keeps masking `code`, which can be an authorization or invite code', () => {
        expect(redactText('https://app.dou.io/oauth?provider=google&code=4/0Ab-secret&version=2')).toBe(
            'https://app.dou.io/oauth?provider=google&code=[REDACTED]&version=2'
        );
    });

    it('matches names case-insensitively and keeps distinct values of one name', () => {
        expect(redactText('/x?Lang=ko&page=1&page=2&page=1')).toBe('/x?Lang=ko&page=1&page=2');
    });

    it('masks an address that turns up in a listed parameter, as it is no plain value', () => {
        expect(redactText('/x?type=someone@user.test')).toBe('/x?type=[REDACTED]');
    });

    it('masks a listed parameter whose value is not a plain id, version or word', () => {
        expect(redactText('https://x/a?cid=1?token=SECRETSECRET')).toBe('https://x/a?cid=[REDACTED]');
        expect(redactText('/a?cid=1;token=SECRET&v=2')).toBe('/a?cid=[REDACTED]&v=2');
        expect(redactText('/a?type=jane%40gmail.com')).toBe('/a?type=[REDACTED]');
    });

    it('keeps no value at all for a strict caller', () => {
        expect(redactText('/chat?cid=1000002&v=1.2.3', { strict: true })).toBe('/chat?cid=[REDACTED]&v=[REDACTED]');
    });

    it('keeps a listed parameter with no value as an empty value', () => {
        expect(redactText('/x?view&k')).toBe('/x?view=&k=[REDACTED]');
    });
});

describe('redactText with the device salt', () => {
    beforeEach(() => setRedactionSalt(SALT));
    afterEach(() => setRedactionSalt(undefined));

    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MSJ9.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const fcm = 'fMxZ1s9k:APA91bHqRs0dQxT7vWnLpYzB3cKmJ4eR5uG';

    it('fingerprints JWTs, bearer tokens and FCM tokens', () => {
        expect(redactText(`401 - Bearer ${jwt}`)).toBe(`401 - Bearer [JWT#${fingerprint(jwt)}]`);
        expect(redactText('authorization: Bearer abcdef1234567890')).toBe(
            `authorization: Bearer [TOKEN#${fingerprint('abcdef1234567890')}]`
        );
        expect(redactText(`token=${fcm}`)).toBe(`token=[TOKEN#${fingerprint(fcm)}]`);
    });

    it('tells the same token from a new one', () => {
        const first = redactText(`refresh ${jwt}`);
        expect(redactText(`retry ${jwt}`).split(' ')[1]).toBe(first.split(' ')[1]);
        expect(redactText(`refresh ${jwt.slice(0, -1)}x`)).not.toBe(first);
    });

    it('leaves an AWS access key bare — a key, not a token', () => {
        expect(redactText('AKIAIOSFODNN7EXAMPLE denied')).toBe('[TOKEN] denied');
    });

    it('shows the last four digits of a phone number, one fingerprint for every written form', () => {
        const domestic = `[PHONE#${fingerprint('01012345678')}:…5678]`;
        expect(redactText('sms to 010-1234-5678')).toBe(`sms to ${domestic}`);
        expect(redactText('01012345678')).toBe(domestic);
        expect(redactText('to=+821012345678')).toBe(`to=[PHONE#${fingerprint('821012345678')}:…5678]`);
    });

    it('shows the domain of an address only', () => {
        expect(redactText('lookup failed for someone@user.test')).toBe(
            `lookup failed for [EMAIL#${fingerprint('someone@user.test')}:@user.test]`
        );
    });

    it('gives the same text when masked again', () => {
        const samples = [
            `token:${jwt}`,
            `GET /auth/${jwt}`,
            '/x?type=someone@user.test&cid=c1',
            'https://x/a?cid=01012345678',
            `sms:01012345678?body=hi / Bearer ${jwt} / ${fcm} / a.b@c.io`,
            '{"email":"someone@user.test","phone":"010-1234-5678"}',
        ];
        for (const sample of samples) {
            const once = redactText(sample);
            expect(redactText(once)).toBe(once);
        }
    });

    it('prints bare placeholders for a strict caller and folds detailed ones it is handed', () => {
        expect(redactText(`sms to 010-1234-5678 / ${jwt}`, { strict: true })).toBe('sms to [PHONE] / [JWT]');
        const detailed = redactText('mail someone@user.test');
        expect(redactText(detailed, { strict: true })).toBe('mail [EMAIL]');
    });

    it('still leaves the join axes alone', () => {
        const ids = [
            '9f8e7d6c-5b4a-4321-9876-0123456789ab',
            'ch_01H9Z@usr_01H9Y',
            'run-1757462400000',
            '1757462400000',
        ];
        for (const id of ids) expect(redactText(id)).toBe(id);
    });
});
