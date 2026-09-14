import { toWireLogEntry } from '../serialization/wire';

import type { LogEntry } from '../core/types';

/**
 * 카탈로그 §금지·중복 규칙의 "싣지 않는다" 목록을 엔트리 하나로 통과시켜, **서버로 나가는 모양**에
 * 남지 않는지 확인한다.
 *
 * 다른 마스킹 스위트는 조각(`redactText`·`isSensitiveField`)을 본다. 이건 **경계**를 본다 — 조각이
 * 다 맞아도 배선이 한 칸 틀리면(message가 safeStringify를 안 타는 게 실제로 그랬다) 값은 그대로
 * 나간다. 그리고 이 목록은 vault 카탈로그가 정본이므로, 항목이 추가되면 여기 케이스도 추가된다.
 *
 * **이 스위트는 호출자의 의무를 대신하지 않는다.** 마스킹은 알아볼 수 있는 모양만 잡는다. 여기
 * 통과가 "실어도 된다"는 뜻이 아니다.
 */
const mapped = (entry: Partial<LogEntry>) =>
    toWireLogEntry({ level: 'error', tag: 'TEST', message: '', timestamp: 1, ...entry } as LogEntry);

/** 전체 페이로드를 한 문자열로 — 유출은 어디에 있어도 유출이므로 부정 단정은 이걸 훑는다. */
const wire = (entry: Partial<LogEntry>) => JSON.stringify(mapped(entry));

/** `data`는 wire에서 문자열이라 중첩 인용이 된다 — 긍정 단정은 되돌려 읽는다. */
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
        // 존재 플래그는 값을 안 싣기 위해 만든 것이라 살아 있어야 한다.
        expect(wireData({ data: { offerToken: 'offer-abc-123', hasOfferToken: true } }).hasOfferToken).toBe(true);
    });

    it('쿼리스트링의 capability 재료', () => {
        const out = wire({ message: 'open https://app.dou.io/invite/accept?code=secret-invite&state=nonce' });

        expect(out).not.toContain('secret-invite');
        expect(out).not.toContain('nonce');
        // 어느 파라미터가 있었는지는 진단이므로 이름은 남는다.
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
 * 반대 방향. 이 필드들이 지워지면 추적 자체가 성립하지 않는다 — 과잉 마스킹은 과소보다 조용해서
 * 더 늦게 발견된다.
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
