import { buildDeviceInfoParams } from './buildDeviceInfoParams';
import type { CachedDeviceInfo, DynamicDeviceInfo } from './buildDeviceInfoParams';

const cached: CachedDeviceInfo = {
    platform: 'ios',
    applicationName: 'chatic',
    deviceModel: 'iPhone15,2',
    appVersion: '1.0.0',
    buildNumber: '42',
    deviceId: 'device-1',
    osVersion: '18.0',
    runId: 'run-abc',
};

const dynamic: DynamicDeviceInfo = {
    stage: 'PROD',
    consoleEnabled: false,
    appLanguage: 'ko',
    firebaseInstallId: 'fid-1',
    latestVersion: '1.1.0',
    shouldUpdate: true,
};

describe('buildDeviceInfoParams — 주입 deviceInfo 조립', () => {
    it('캐싱된 정적 값과 동적 값을 그대로 매핑한다', () => {
        const params = buildDeviceInfoParams(cached, dynamic);

        expect(params).toMatchObject({
            platform: 'ios',
            applicationName: 'chatic',
            stage: 'PROD',
            deviceModel: 'iPhone15,2',
            appVersion: '1.0.0',
            buildNumber: '42',
            appLanguage: 'ko',
            latestVersion: '1.1.0',
            shouldUpdate: true,
        });
    });

    it('deprecated 필드(installationId)와 신규 필드(uniqueDeviceId)에 모두 bare device id를 넣는다', () => {
        const params = buildDeviceInfoParams(cached, dynamic);

        expect(params.installationId).toBe('device-1');
        expect(params.uniqueDeviceId).toBe('device-1');
    });

    it('uniqueId는 device id와 firebase id를 결합한다', () => {
        const params = buildDeviceInfoParams(cached, dynamic);

        expect(params.uniqueId).toBe('device-1:fid-1');
    });

    it('firebase id가 없으면 uniqueId는 bare device id, firebaseInstallationId는 빈 문자열', () => {
        const withoutFid = buildDeviceInfoParams(cached, { ...dynamic, firebaseInstallId: null });

        expect(withoutFid.uniqueId).toBe('device-1');
        expect(withoutFid.firebaseInstallationId).toBe('');
    });

    it('deviceModel이 비면 빈 문자열로 대체한다', () => {
        const params = buildDeviceInfoParams({ ...cached, deviceModel: '' }, dynamic);

        expect(params.deviceModel).toBe('');
    });
});

describe('로그 컨텍스트용 필드', () => {
    it('runId와 osVersion을 그대로 옮긴다 — 웹이 이 값으로 엔트리를 스탬프한다', () => {
        const params = buildDeviceInfoParams(cached, dynamic);

        expect(params.runId).toBe('run-abc');
        expect(params.osVersion).toBe('18.0');
    });
});

describe('consoleEnabled — 웹의 debug 릴레이 게이트', () => {
    it('넘겨받은 값을 그대로 옮긴다 — 여기서 __DEV__를 읽지 않는다', () => {
        // 이 함수가 순수한 것이 존재 이유다. 빌드 전역을 안에서 읽으면 WebView
        // 없이 테스트할 수 없어진다.
        const on = buildDeviceInfoParams(cached, { ...dynamic, consoleEnabled: true });
        const off = buildDeviceInfoParams(cached, { ...dynamic, consoleEnabled: false });

        expect(on.consoleEnabled).toBe(true);
        expect(off.consoleEnabled).toBe(false);
    });
});
