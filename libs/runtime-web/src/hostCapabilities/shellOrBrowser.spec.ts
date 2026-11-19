import { buildHostProfile, logger } from '@chatic/bridges';

import { resolveCheckoutMethod } from './checkout';
import { resolveFilesMethod } from './files';
import { resolveMediaMethod } from './media';
import {
    resolveAppShell,
    resolveDiagnosticsMethod,
    resolveLinksMethod,
    resolvePushMethod,
    resolveSignIn,
} from './shellDomains';
import { resolveShellOrBrowser } from './shellOrBrowser';

const post = { postMessage: jest.fn() };

/**
 * The declaration the phone app 0.32.2 injects, as it shipped to the stores: version 4, with the
 * values spelled `'app'` and `'page'` from before the rename.
 */
const shipped0322 = (os: 'ios' | 'android') =>
    buildHostProfile({
        ReactNativeWebView: post,
        CHATIC_APP_PLATFORM: os,
        CHATIC_APP_CAPABILITIES: {
            version: 4,
            checkout: [os === 'ios' ? 'apple' : 'google'],
            media: 'app',
            files: 'app',
            links: 'app',
            appShell: 'app',
            signIn: 'app',
            diagnostics: 'app',
            push: 'app',
        },
    });

describe('resolveShellOrBrowser with a spelling the phone app already shipped', () => {
    let warn: jest.SpyInstance;
    beforeEach(() => {
        warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    });
    afterEach(() => warn.mockRestore());

    it.each(['ios', 'android'] as const)('gives every port of an installed 0.32.2 %s app to the shell', os => {
        const profile = shipped0322(os);
        expect(resolveMediaMethod(profile)).toBe('shell');
        expect(resolveFilesMethod(profile)).toBe('shell');
        expect(resolveLinksMethod(profile)).toBe('shell');
        expect(resolveAppShell(profile)).toEqual({ kind: 'shell', os });
        expect(resolveSignIn(profile)).toEqual({ kind: 'shell', os });
        expect(resolveDiagnosticsMethod(profile)).toBe('shell');
        expect(resolvePushMethod(profile)).toBe('shell');
        expect(resolveCheckoutMethod(profile)).toBe(os === 'ios' ? 'apple' : 'google');
        expect(warn).not.toHaveBeenCalled();
    });

    it("reads 'page' as the browser, without a warning", () => {
        const profile = buildHostProfile({
            ReactNativeWebView: post,
            CHATIC_APP_CAPABILITIES: { version: 4, checkout: [], signIn: 'page' },
        });
        expect(resolveShellOrBrowser(profile, 'signIn', 4)).toBe('browser');
        expect(warn).not.toHaveBeenCalled();
    });

    it('still falls back to the browser, and says so, for a value neither vocabulary has', () => {
        const profile = buildHostProfile({
            ReactNativeWebView: post,
            CHATIC_APP_CAPABILITIES: { version: 4, checkout: [], signIn: 'native' },
        });
        expect(resolveShellOrBrowser(profile, 'signIn', 4)).toBe('browser');
        expect(warn).toHaveBeenCalledTimes(1);
    });

    it('does not read a key inherited from Object.prototype as a shipped spelling', () => {
        const profile = buildHostProfile({
            ReactNativeWebView: post,
            CHATIC_APP_CAPABILITIES: { version: 4, checkout: [], signIn: 'toString' },
        });
        expect(resolveShellOrBrowser(profile, 'signIn', 4)).toBe('browser');
    });
});
