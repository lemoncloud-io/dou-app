import {
    getConfigBagScript,
    getDebugModeScript,
    getDeviceInfoScript,
    getLogUploadHoldScript,
    getSyncInjectionScript,
    getThemeScript,
} from './injectionScripts';
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

        expect(script).toContain('window.CHATIC_APP_UNIQUE_DEVICE_ID = "device-1";');
        expect(script).toContain('window.CHATIC_APP_FIREBASE_INSTALLATION_ID = "fid-1";');
    });

    it('deprecated 필드(uniqueId/installationId)도 구버전 웹 호환을 위해 계속 주입한다', () => {
        const script = getDeviceInfoScript(makeParams());

        // Older web bundles read these globals; dropping them would break
        // registration for webs deployed before the new fields existed.
        expect(script).toContain('window.CHATIC_APP_DEVICE_ID = "device-1:fid-1";');
        expect(script).toContain('window.CHATIC_APP_INSTALLATION_ID = "device-1";');
    });

    it('firebase id가 아직 resolve되지 않았으면 빈 문자열로 주입한다', () => {
        const script = getDeviceInfoScript(makeParams({ firebaseInstallationId: '' }));

        expect(script).toContain('window.CHATIC_APP_FIREBASE_INSTALLATION_ID = "";');
    });

    it('값에 홑따옴표/쌍따옴표/백슬래시가 섞여도 유효한 JS로 이스케이프되어 SyntaxError 없이 평가된다', () => {
        // Regression test for the "Script error." root cause: a raw `'${value}'` interpolation
        // breaks the string literal (and the whole injected script, incl. the console override that
        // follows it) whenever a native-supplied value contains a quote/backslash.
        const script = getDeviceInfoScript(
            makeParams({
                applicationName: `O'Brien's "DoU" \\ App`,
                deviceModel: `Galaxy's\\Edge`,
            })
        );

        const sandbox: { CHATIC_APP_APPLICATION?: string; CHATIC_APP_DEVICE_MODEL?: string } = {};
        // Evaluating the generated script is the only way to assert it is syntactically valid —
        // the WebView runs it the same way (`injectedJavaScript`), so this is the fixture, not a
        // generic eval of untrusted input.
        // eslint-disable-next-line no-new-func
        expect(() => new Function('window', script)(sandbox)).not.toThrow();
        expect(sandbox.CHATIC_APP_APPLICATION).toBe(`O'Brien's "DoU" \\ App`);
        expect(sandbox.CHATIC_APP_DEVICE_MODEL).toBe(`Galaxy's\\Edge`);
    });
});

describe('getDebugModeScript — 디버그 모드 언락 주입 스크립트', () => {
    it('영속화된 언락 상태를 boolean 전역으로 주입한다', () => {
        expect(getDebugModeScript(true)).toContain('window.CHATIC_APP_DEBUG_MODE = true;');
        expect(getDebugModeScript(false)).toContain('window.CHATIC_APP_DEBUG_MODE = false;');
    });
});

describe('getLogUploadHoldScript — 전송 보류 주입 스크립트', () => {
    it('보류 상태를 boolean 전역으로 주입한다', () => {
        expect(getLogUploadHoldScript(true)).toContain('window.CHATIC_APP_LOG_UPLOAD_HOLD = true;');
        expect(getLogUploadHoldScript(false)).toContain('window.CHATIC_APP_LOG_UPLOAD_HOLD = false;');
    });
});

describe('getThemeScript — 테마 주입 스크립트', () => {
    it('영속화된 테마를 문자열 전역으로 주입한다', () => {
        // JSON.stringify, not a quoted template hole: the result is evaluated as JS, so the
        // value has to be escaped at the sink rather than trusted from two modules away.
        expect(getThemeScript('light')).toContain('window.CHATIC_APP_THEME = "light";');
        expect(getThemeScript('dark')).toContain('window.CHATIC_APP_THEME = "dark";');
    });
});

describe('getConfigBagScript — 셸 KV 봉투 주입 스크립트', () => {
    it('키-값 봉투를 JSON 전역으로 주입한다', () => {
        const script = getConfigBagScript({ 'ui.theme': '"dark"', 'debug.mockService.mode': '"off"' });

        expect(script).toContain(
            'window.CHATIC_APP_CONFIG_BAG = {"ui.theme":"\\"dark\\"","debug.mockService.mode":"\\"off\\""};'
        );
    });

    it('빈 봉투는 빈 객체로 주입한다 — 구 셸에서도 readBag()이 크래시하지 않는다', () => {
        expect(getConfigBagScript({})).toContain('window.CHATIC_APP_CONFIG_BAG = {};');
    });

    it('값에 따옴표/백슬래시가 섞여도 유효한 JS로 평가된다 — 원본 문자열이 그대로 살아남는다', () => {
        // Same regression shape as getDeviceInfoScript's own quote test: a raw template hole would
        // let a stored value's embedded quote break out of the object literal.
        const raw = `{"a":"O'Brien's \\"quoted\\" \\\\ value"}`;
        const script = getConfigBagScript({ 'debug.mockService.baseUrl': raw });

        const sandbox: { CHATIC_APP_CONFIG_BAG?: Record<string, string> } = {};
        // eslint-disable-next-line no-new-func
        expect(() => new Function('window', script)(sandbox)).not.toThrow();
        expect(sandbox.CHATIC_APP_CONFIG_BAG).toEqual({ 'debug.mockService.baseUrl': raw });
    });
});

describe('getSyncInjectionScript — 통합 주입 스크립트', () => {
    it('테마를 포함해 주입한다', () => {
        const script = getSyncInjectionScript({
            insets: { top: 0, bottom: 0, left: 0, right: 0 },
            keyboardHeight: 0,
            deviceInfo: makeParams(),
            theme: 'dark',
        });

        // The web's pre-paint script reads this global before the first paint, so it must
        // ride along in the same script that is injected before content loads.
        expect(script).toContain('window.CHATIC_APP_THEME = "dark";');
    });

    it('셸 KV 봉투를 넘기면 그대로 싣는다', () => {
        const script = getSyncInjectionScript({
            insets: { top: 0, bottom: 0, left: 0, right: 0 },
            keyboardHeight: 0,
            deviceInfo: makeParams(),
            theme: 'dark',
            configBag: { 'ui.theme': '"dark"' },
        });

        expect(script).toContain('window.CHATIC_APP_CONFIG_BAG = {"ui.theme":"\\"dark\\""};');
    });

    it('봉투를 안 넘기면 빈 객체로 주입한다', () => {
        const script = getSyncInjectionScript({
            insets: { top: 0, bottom: 0, left: 0, right: 0 },
            keyboardHeight: 0,
            deviceInfo: makeParams(),
            theme: 'dark',
        });

        expect(script).toContain('window.CHATIC_APP_CONFIG_BAG = {};');
    });

    it('보류 상태를 부팅 스크립트에 싣는다 — 재시작한 WebView가 보류를 유지해야 한다', () => {
        const script = getSyncInjectionScript({
            insets: { top: 0, bottom: 0, left: 0, right: 0 },
            keyboardHeight: 0,
            deviceInfo: makeParams(),
            theme: 'dark',
            logUploadHold: true,
        });

        expect(script).toContain('window.CHATIC_APP_LOG_UPLOAD_HOLD = true;');
    });

    it('보류를 안 넘기면 꺼진 상태로 주입한다 — 전역이 없으면 웹이 판단 근거를 잃는다', () => {
        const script = getSyncInjectionScript({
            insets: { top: 0, bottom: 0, left: 0, right: 0 },
            keyboardHeight: 0,
            deviceInfo: makeParams(),
            theme: 'dark',
        });

        expect(script).toContain('window.CHATIC_APP_LOG_UPLOAD_HOLD = false;');
    });
});
