import type { RegisterDeviceResult } from '@lemoncloud/chatic-pushes-api';

import { summarizeRegisterResult } from './summarizeRegisterResult';

/** Cast helper — the runtime response is flatter than the published type. */
const asResult = (value: Record<string, unknown>) => value as unknown as RegisterDeviceResult;

describe('summarizeRegisterResult', () => {
    it('결과가 없으면 미등록으로 판정한다', () => {
        expect(summarizeRegisterResult(null).registered).toBe(false);
        expect(summarizeRegisterResult(undefined).registered).toBe(false);
    });

    it('플랫 응답(status active + endpoint + updatedAt)을 등록됨으로 요약한다', () => {
        // Actual server shape observed in production.
        const result = asResult({
            deviceId: '3C8DFB6C',
            endpoint: 'arn:aws:sns:ap-northeast-2:...:endpoint/APNS_SANDBOX/chatic-ios-dev/1db6',
            status: 'active',
            platform: 'ios',
            application: 'chatic',
            stage: 'dev',
            updatedAt: 1782981031791,
        });

        expect(summarizeRegisterResult(result)).toEqual({
            registered: true,
            status: 'active',
            endpoint: 'arn:aws:sns:ap-northeast-2:...:endpoint/APNS_SANDBOX/chatic-ios-dev/1db6',
            registeredAt: 1782981031791,
            deviceId: '3C8DFB6C',
        });
    });

    it('status가 active가 아니고 endpoint도 없으면 미등록', () => {
        expect(summarizeRegisterResult(asResult({ status: 'pending' })).registered).toBe(false);
    });

    it('레거시 중첩(User.endpoint) 응답도 등록됨으로 처리한다', () => {
        const result = asResult({ User: { endpoint: 'arn:endpoint', registeredAt: 1700000000000, deviceId: 'dev-1' } });

        const summary = summarizeRegisterResult(result);
        expect(summary.registered).toBe(true);
        expect(summary.endpoint).toBe('arn:endpoint');
        expect(summary.registeredAt).toBe(1700000000000);
        expect(summary.deviceId).toBe('dev-1');
    });
});
