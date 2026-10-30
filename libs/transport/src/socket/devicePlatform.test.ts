import { readDeviceEnvironment, resolveSocketDevice } from './devicePlatform';

const UA = {
    macChrome:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
    macSafari:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
    windowsEdge:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0',
    linuxFirefox: 'Mozilla/5.0 (X11; Linux x86_64; rv:144.0) Gecko/20100101 Firefox/144.0',
    androidSamsung:
        'Mozilla/5.0 (Linux; Android 15; SM-S928N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36',
    iphoneChrome:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.0.0 Mobile/15E148 Safari/604.1',
    electronMac:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) chatic-desktop/0.9.0 Chrome/138.0.0.0 Electron/37.0.0 Safari/537.36',
    electronWindows:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) chatic-desktop/0.9.0 Chrome/138.0.0.0 Electron/37.0.0 Safari/537.36',
    electronLinux:
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) chatic-desktop/0.9.0 Chrome/138.0.0.0 Electron/37.0.0 Safari/537.36',
    iphoneOpera:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1 OPT/5.0.0',
    iosWebView:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
};

describe('resolveSocketDevice', () => {
    describe('mobile shell', () => {
        // The only model global the shell injects is a hardware id (`iPhone17,1`, a board codename on
        // Android), and a sent name overwrites the row's label on every save.
        it.each(['ios', 'android'] as const)('sends %s as injected, with no name', appPlatform => {
            expect(resolveSocketDevice({ appPlatform, userAgent: UA.iosWebView })).toEqual({ platform: appPlatform });
        });
    });

    describe('desktop shell', () => {
        it.each([
            [UA.electronMac, 'macos'],
            [UA.electronWindows, 'windows'],
            [UA.electronLinux, 'linux'],
        ])('reads the operating system from the user agent (%#)', (userAgent, platform) => {
            expect(resolveSocketDevice({ appPlatform: 'desktop', userAgent })).toEqual({ platform });
        });

        it('falls back to web when the user agent names no desktop system', () => {
            expect(resolveSocketDevice({ appPlatform: 'desktop', userAgent: 'curl/8.0' })).toEqual({ platform: 'web' });
        });
    });

    describe('browser', () => {
        it.each([
            [UA.macChrome, 'Chrome · macOS'],
            [UA.macSafari, 'Safari · macOS'],
            [UA.windowsEdge, 'Edge · Windows'],
            [UA.linuxFirefox, 'Firefox · Linux'],
            [UA.androidSamsung, 'Samsung Internet · Android'],
            [UA.iphoneChrome, 'Chrome · iOS'],
            [UA.iphoneOpera, 'Opera · iOS'],
        ])('sends web, named after the browser and system (%#)', (userAgent, name) => {
            expect(resolveSocketDevice({ userAgent })).toEqual({ platform: 'web', name });
        });

        it('sends web with no name when nothing is known', () => {
            expect(resolveSocketDevice({})).toEqual({ platform: 'web' });
        });

        it('sends web for a platform value it does not know', () => {
            expect(resolveSocketDevice({ appPlatform: 'tizen', userAgent: UA.macChrome })).toEqual({
                platform: 'web',
                name: 'Chrome · macOS',
            });
        });
    });
});

describe('readDeviceEnvironment', () => {
    const globals = window as unknown as { CHATIC_APP_PLATFORM?: string };

    afterEach(() => {
        delete globals.CHATIC_APP_PLATFORM;
    });

    it('reads the shell-injected platform and the user agent', () => {
        globals.CHATIC_APP_PLATFORM = 'android';

        expect(readDeviceEnvironment()).toEqual({ appPlatform: 'android', userAgent: navigator.userAgent });
    });

    it('reads no platform in a plain browser', () => {
        expect(readDeviceEnvironment().appPlatform).toBeUndefined();
        expect(resolveSocketDevice().platform).toBe('web');
    });
});
