import { getDebugModeScript, getDeviceInfoScript } from './injectionScripts';
import type { DeviceInfoParams } from './injectionScripts';

const makeParams = (overrides: Partial<DeviceInfoParams> = {}): DeviceInfoParams => ({
    platform: 'ios',
    applicationName: 'chatic',
    stage: 'PROD',
    uniqueId: 'device-1:fid-1',
    deviceModel: 'iPhone15,2',
    appVersion: '1.0.0',
    buildNumber: '42',
    appLanguage: 'ko',
    installationId: 'device-1',
    uniqueDeviceId: 'device-1',
    firebaseInstallationId: 'fid-1',
    latestVersion: '1.0.0',
    shouldUpdate: false,
    ...overrides,
});

describe('getDeviceInfoScript — 디바이스 정보 주입 스크립트', () => {
    it('신규 필드 uniqueDeviceId/firebaseInstallationId를 window 글로벌로 주입한다', () => {
        const script = getDeviceInfoScript(makeParams());

        expect(script).toContain("window.CHATIC_APP_UNIQUE_DEVICE_ID = 'device-1';");
        expect(script).toContain("window.CHATIC_APP_FIREBASE_INSTALLATION_ID = 'fid-1';");
    });

    it('deprecated 필드(uniqueId/installationId)도 구버전 웹 호환을 위해 계속 주입한다', () => {
        const script = getDeviceInfoScript(makeParams());

        // Older web bundles read these globals; dropping them would break
        // registration for webs deployed before the new fields existed.
        expect(script).toContain("window.CHATIC_APP_DEVICE_ID = 'device-1:fid-1';");
        expect(script).toContain("window.CHATIC_APP_INSTALLATION_ID = 'device-1';");
    });

    it('firebase id가 아직 resolve되지 않았으면 빈 문자열로 주입한다', () => {
        const script = getDeviceInfoScript(makeParams({ firebaseInstallationId: '' }));

        expect(script).toContain("window.CHATIC_APP_FIREBASE_INSTALLATION_ID = '';");
    });
});

describe('getDebugModeScript — 디버그 모드 언락 주입 스크립트', () => {
    it('영속화된 언락 상태를 boolean 전역으로 주입한다', () => {
        expect(getDebugModeScript(true)).toContain('window.CHATIC_APP_DEBUG_MODE = true;');
        expect(getDebugModeScript(false)).toContain('window.CHATIC_APP_DEBUG_MODE = false;');
    });
});
