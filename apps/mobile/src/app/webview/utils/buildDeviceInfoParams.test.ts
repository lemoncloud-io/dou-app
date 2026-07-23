import { buildDeviceInfoParams } from './buildDeviceInfoParams';
import type { CachedDeviceInfo, DynamicDeviceInfo } from './buildDeviceInfoParams';

const cached: CachedDeviceInfo = {
    platform: 'ios',
    applicationName: 'chatic',
    deviceModel: 'iPhone15,2',
    appVersion: '1.0.0',
    buildNumber: '42',
    deviceId: 'device-1',
};

const dynamic: DynamicDeviceInfo = {
    stage: 'PROD',
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
