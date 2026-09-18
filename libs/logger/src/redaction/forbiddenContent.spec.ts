import { toWireLogEntry } from '../serialization/wire';

import type { LogEntry } from '../core/types';

/**
 * Runs the catalog's §Forbidden/Duplicate rule's "don't carry this" list through a single
 * entry, checking that it doesn't survive into **the shape that goes out to the server**.
 *
 * Other masking suites look at the pieces (`redactText`, `isSensitiveField`). This one looks
 * at **the boundary** — even with every piece correct, one step of wiring out of place (message
 * not going through safeStringify was exactly this, in practice) and the value goes out as-is.
 * And since this list's source of truth is the vault catalog, a case here gets added whenever
 * an item is added there.
 *
 * **This suite does not stand in for the caller's own responsibility.** Masking only catches
 * shapes it can recognize. Passing here does not mean "safe to carry."
 */
const mapped = (entry: Partial<LogEntry>) =>
    toWireLogEntry({ level: 'error', tag: 'TEST', message: '', timestamp: 1, ...entry } as LogEntry);

/** The whole payload as one string — a leak is a leak wherever it sits, so negative assertions scan this. */
const wire = (entry: Partial<LogEntry>) => JSON.stringify(mapped(entry));

/** `data` is a string on the wire, so it ends up nested-quoted — positive assertions read it back. */
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
        // The presence flag is made to avoid carrying the value, so it must survive.
        expect(wireData({ data: { offerToken: 'offer-abc-123', hasOfferToken: true } }).hasOfferToken).toBe(true);
    });

    it('쿼리스트링의 capability 재료', () => {
        const out = wire({ message: 'open https://app.dou.io/invite/accept?code=secret-invite&state=nonce' });

        expect(out).not.toContain('secret-invite');
        expect(out).not.toContain('nonce');
        // Which parameter was present is diagnostic, so the name survives.
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

/**
 * The opposite direction. If these fields were redacted, tracing itself would fall apart —
 * over-masking is quieter than under-masking, so it gets noticed later.
 */
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
