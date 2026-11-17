import { buildHostProfile, logger } from '@chatic/bridges';

import { resolveAppShell } from './appShell';
import { resolveDiagnosticsMethod } from './diagnostics';
import { resolveLinksMethod } from './links';
import { resolvePushMethod } from './push';
import { resolveSignIn } from './signIn';

const post = { postMessage: jest.fn() };
const phone = (platform: string, extra: Record<string, unknown> = {}) =>
    buildHostProfile({ ReactNativeWebView: post, CHATIC_APP_PLATFORM: platform, ...extra });
const desktop = (extra: Record<string, unknown> = {}) => buildHostProfile({ ChaticMessageHandler: post, ...extra });
const browser = (extra: Record<string, unknown> = {}) => buildHostProfile({ ...extra });

const v4 = (keys: Record<string, unknown>) => ({
    CHATIC_APP_CAPABILITIES: { version: 4, checkout: [], media: 'app', files: 'app', ...keys },
});

const kinds = {
    links: (profile: ReturnType<typeof buildHostProfile>) => resolveLinksMethod(profile),
    appShell: (profile: ReturnType<typeof buildHostProfile>) => resolveAppShell(profile).kind,
    signIn: (profile: ReturnType<typeof buildHostProfile>) => resolveSignIn(profile).kind,
    diagnostics: (profile: ReturnType<typeof buildHostProfile>) => resolveDiagnosticsMethod(profile),
    push: (profile: ReturnType<typeof buildHostProfile>) => resolvePushMethod(profile),
};

describe.each(Object.entries(kinds))('the %s port', (key, kindOf) => {
    let warn: jest.SpyInstance;
    beforeEach(() => {
        warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    });
    afterEach(() => warn.mockRestore());

    // The answer the page gave before the port: `isNative()` meant the app does it.
    it('answers a host that declares nothing as isNative() did', () => {
        expect(kindOf(phone('ios'))).toBe('app');
        expect(kindOf(desktop())).toBe('app');
        expect(kindOf(browser())).toBe('page');
    });

    it('leaves a declaration older than version 4, which never knew the key, to the legacy rule', () => {
        const v3 = { CHATIC_APP_CAPABILITIES: { version: 3, checkout: [], media: 'app', files: 'app' } };
        expect(kindOf(phone('android', v3))).toBe('app');
        expect(kindOf(desktop({ CHATIC_APP_CAPABILITIES: { version: 1, checkout: [] } }))).toBe('app');
        expect(warn).not.toHaveBeenCalled();
    });

    it('reads what a version-4 declaration says, even against the bridge', () => {
        expect(kindOf(phone('ios', v4({ [key]: 'page' })))).toBe('page');
        expect(kindOf(browser(v4({ [key]: 'app' })))).toBe('app');
    });

    it('falls back to the page, and says so, when a version-4 declaration leaves the key out or names something else', () => {
        expect(kindOf(phone('ios', v4({})))).toBe('page');
        expect(kindOf(phone('ios', v4({ [key]: 'shell' })))).toBe('page');
        // Both are logged: the missing key where the declaration is read, the unknown value here.
        expect(warn).toHaveBeenCalledTimes(2);
    });
});

describe('the phone platform on appShell and signIn', () => {
    it.each([
        ['ios', 'ios'],
        ['IOS', 'ios'],
        ['android', 'android'],
        ['desktop', null],
    ])('names %s as %s where the app does the work', (platform, os) => {
        expect(resolveAppShell(phone(platform)).os).toBe(os);
        expect(resolveSignIn(phone(platform)).os).toBe(os);
    });

    it('names none where the page does it, whatever the platform global says', () => {
        expect(resolveAppShell(browser({ CHATIC_APP_PLATFORM: 'ios' })).os).toBeNull();
        expect(resolveSignIn(phone('ios', v4({ signIn: 'page' }))).os).toBeNull();
    });
});
