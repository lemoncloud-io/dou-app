import { toWireLogEntry } from '../serialization/wire';

import type { LogEntry } from '../core/types';

const mapped = (entry: Partial<LogEntry>) =>
    toWireLogEntry({ level: 'error', tag: 'TEST', message: '', timestamp: 1, ...entry } as LogEntry);

const wire = (entry: Partial<LogEntry>) => JSON.stringify(mapped(entry));

const wireData = (entry: Partial<LogEntry>) => JSON.parse(mapped(entry).data ?? '{}');

describe('카탈로그 금지 항목이 wire에 남지 않는다', () => {
    it('세션·FCM 토큰', () => {
        const fcm = 'fMxZ1s9k:APA91bHqRs0dQxT7vWnLpYzB3cKmJ4eR5uG';
        const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MSJ9.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW';

        const out = wire({ message: `push token ${fcm}`, data: { identityToken: jwt, sessionToken: 'raw-session' } });

        expect(out).not.toContain('APA91b');
        expect(out).not.toContain('eyJhbGci');
        expect(out).not.toContain('raw-session');
    });

    it('비밀번호와 1회용 코드', () => {
        const out = wire({ data: { password: 'hunter2', code: '483920', pwd: 'x', otp: '1234' } });

        expect(out).not.toContain('hunter2');
        expect(out).not.toContain('483920');
    });

    it('메시지 본문과 푸시 제목·본문', () => {
        const out = wire({
            data: { messageBody: '오늘 저녁에 봐요', pushTitle: '새 메시지', notificationBody: '내용' },
        });

        expect(out).not.toContain('오늘 저녁에 봐요');
        expect(out).not.toContain('새 메시지');
        expect(out).not.toContain('내용');
    });

    it('영수증 원문', () => {
        const out = wire({ data: { receipt: 'MIIT...base64...', purchaseReceipt: 'raw' } });

        expect(out).not.toContain('MIIT');
    });

    it('이메일 주소 — 키로도, 문장 안에서도', () => {
        const out = wire({ message: 'lookup failed for someone@user.test', data: { email: 'other@user.test' } });

        expect(out).not.toContain('someone@user.test');
        expect(out).not.toContain('other@user.test');
    });

    it('전화번호 원문 — 키로도, 문장 안에서도', () => {
        const out = wire({ message: 'sms to 010-1234-5678', data: { phoneNumber: '+821012345678' } });

        expect(out).not.toContain('1234-5678');
        expect(out).not.toContain('821012345678');
    });

    it('offerToken 값', () => {
        const out = wire({ data: { offerToken: 'offer-abc-123', hasOfferToken: true } });

        expect(out).not.toContain('offer-abc-123');
        expect(wireData({ data: { offerToken: 'offer-abc-123', hasOfferToken: true } }).hasOfferToken).toBe(true);
    });

    it('쿼리스트링의 capability 재료', () => {
        const out = wire({ message: 'open https://app.dou.io/invite/accept?code=secret-invite&state=nonce' });

        expect(out).not.toContain('secret-invite');
        expect(out).not.toContain('nonce');
        expect(out).toContain('code=');
    });

    it('AWS 자격증명', () => {
        const out = wire({
            message: 'denied for AKIAIOSFODNN7EXAMPLE',
            data: { secretAccessKey: 'k', authorization: 'Bearer abcdef1234567890' },
        });

        expect(out).not.toContain('AKIAIOSFODNN7EXAMPLE');
        expect(out).not.toContain('abcdef1234567890');
    });
});

describe('추적 축은 그대로 남는다', () => {
    const traced = {
        runId: 'run-1',
        uid: 'user-1',
        cid: 'cloud-1',
        sid: 'site-1',
        route: '/chat/ch-1',
        appVersion: '1.2.3',
        webVersion: '0.59.0',
        data: { errorCode: 409, statusCode: 503, countryCode: 'KR', channelId: 'ch-1@usr-2' },
    };

    it('발생 시점 컨텍스트는 마스킹되지 않는다', () => {
        expect(mapped(traced)).toMatchObject({
            runId: 'run-1',
            uid: 'user-1',
            cid: 'cloud-1',
            sid: 'site-1',
            route: '/chat/ch-1',
            appVersion: '1.2.3',
            webVersion: '0.59.0',
        });
    });

    it('진단 필드와 조인 축은 마스킹되지 않는다', () => {
        expect(wireData(traced)).toEqual({
            errorCode: 409,
            statusCode: 503,
            countryCode: 'KR',
            channelId: 'ch-1@usr-2',
        });
        expect(wire(traced)).not.toContain('[REDACTED]');
    });
});

describe('fingerprints and partial display leave nothing else behind', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MSJ9.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW';
    const fcm = 'fMxZ1s9k:APA91bHqRs0dQxT7vWnLpYzB3cKmJ4eR5uG';

    it('keeps no digit of a phone number but the last four', () => {
        const out = wire({
            message: 'sms to 010-9876-5432 and +821098765432',
            data: { phoneNumber: '01098765432', note: 'call 010 9876 5432' },
        });

        expect(out).toContain('…5432');
        for (const fragment of ['010-9876', '9876-', '0109876', '8210987', '98765', '010 9876']) {
            expect(out).not.toContain(fragment);
        }
    });

    it('keeps no local part of an address', () => {
        const out = wire({ message: 'lookup failed for jane.doe@gmail.com', data: { email: 'john.roe@naver.com' } });

        expect(out).toContain(':@gmail.com]');
        expect(out).toContain(':@naver.com]');
        expect(out).not.toContain('jane.doe');
        expect(out).not.toContain('john.roe');
    });

    it('keeps no personal or company domain', () => {
        const out = wire({
            message: 'bounce from jane@jane-doe.com and ops@mail.naver.com',
            data: { email: 'kim@lemoncloud.io' },
        });

        for (const fragment of ['jane-doe', 'mail.naver', 'lemoncloud', 'jane@', 'ops@', 'kim@']) {
            expect(out).not.toContain(fragment);
        }
        expect(out).toContain('[EMAIL]');
    });

    it('keeps no part of a token body', () => {
        const out = wire({
            message: `push ${fcm} / Bearer ${jwt}`,
            data: { deviceToken: fcm, delegationToken: 'dlg-0123456789abcdef', identityToken: jwt },
        });

        for (const fragment of ['APA91b', 'fMxZ1s9k', 'eyJhbGci', 'dBjftJeZ', 'dlg-0123']) {
            expect(out).not.toContain(fragment);
        }
        expect(out).toMatch(/\[TOKEN#[0-9a-f]{6}\]/);
        expect(out).toMatch(/\[JWT#[0-9a-f]{6}\]/);
    });

    it('gives passwords, one-time codes and secrets no fingerprint', () => {
        const out = wire({
            data: { password: 'hunter2-long-password', otp: '483920', code: '1234', secret: 'shh-0123456789abcdef' },
        });

        expect(wireData({ data: { password: 'x', otp: '1', code: '2', secret: 's' } })).toEqual({
            password: '[REDACTED]',
            otp: '[REDACTED]',
            code: '[REDACTED]',
            secret: '[REDACTED]',
        });
        expect(out).not.toMatch(/REDACTED#/);
        expect(out).not.toContain('hunter2');
        expect(out).not.toContain('483920');
    });

    it('gives phone numbers and addresses no fingerprint', () => {
        const out = wire({
            message: 'mail jane@gmail.com, call 010-9876-5432',
            data: { email: 'jane@gmail.com', phone: '01098765432' },
        });

        expect(out).toContain('[PHONE:…5432]');
        expect(out).toContain('[EMAIL:@gmail.com]');
        expect(out).not.toMatch(/(?:PHONE|EMAIL)#/);
    });

    it('still leaves the join axes and diagnostic codes alone', () => {
        const ids = { runId: 'run-1757462400000', cid: '1000002', uuid: '9f8e7d6c-5b4a-4321-9876-0123456789ab' };
        const out = mapped({
            ...ids,
            message: `opened ${ids.uuid} at 1757462400000`,
            data: { channelId: 'ch_01H9Z@usr_01H9Y', errorCode: 'E401', responseCode: 7, closeCode: 4001 },
        });

        expect(out).toMatchObject({ runId: ids.runId, cid: ids.cid, message: `opened ${ids.uuid} at 1757462400000` });
        expect(JSON.parse(out.data ?? '{}')).toEqual({
            channelId: 'ch_01H9Z@usr_01H9Y',
            errorCode: 'E401',
            responseCode: 7,
            closeCode: 4001,
        });
    });
});
