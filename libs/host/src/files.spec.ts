import { buildHostProfile, logger } from '@chatic/bridges';

import { resolveFilesMethod } from './files';

const post = { postMessage: jest.fn() };
const phone = (extra: Record<string, unknown> = {}) =>
    buildHostProfile({ ReactNativeWebView: post, CHATIC_APP_PLATFORM: 'ios', ...extra });
const browser = (extra: Record<string, unknown> = {}) => buildHostProfile({ ...extra });

describe('resolveFilesMethod', () => {
    let warn: jest.SpyInstance;
    beforeEach(() => {
        warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    });
    afterEach(() => warn.mockRestore());

    // The answer the page gave before the port: `isNative()` meant the app moves files.
    it.each([
        ['a phone app', phone(), 'app'],
        ['a desktop shell, which has a bridge too', buildHostProfile({ ChaticMessageHandler: post }), 'app'],
        ['a browser tab', browser(), 'page'],
    ])('answers %s that declares nothing with %s', (_name, profile, method) => {
        expect(resolveFilesMethod(profile)).toBe(method);
    });

    it('leaves version-1 and version-2 declarations, which predate the key, to the legacy rule', () => {
        expect(resolveFilesMethod(phone({ CHATIC_APP_CAPABILITIES: { version: 1, checkout: ['apple'] } }))).toBe('app');
        expect(
            resolveFilesMethod(phone({ CHATIC_APP_CAPABILITIES: { version: 2, checkout: ['apple'], media: 'app' } }))
        ).toBe('app');
        expect(
            resolveFilesMethod(browser({ CHATIC_APP_CAPABILITIES: { version: 2, checkout: ['web'], media: 'page' } }))
        ).toBe('page');
        expect(warn).not.toHaveBeenCalled();
    });

    it('reads what a version-3 declaration says, even against the bridge', () => {
        expect(
            resolveFilesMethod(
                phone({ CHATIC_APP_CAPABILITIES: { version: 3, checkout: [], media: 'app', files: 'page' } })
            )
        ).toBe('page');
        expect(
            resolveFilesMethod(
                browser({ CHATIC_APP_CAPABILITIES: { version: 3, checkout: [], media: 'page', files: 'app' } })
            )
        ).toBe('app');
    });

    it('falls back to the page, and says so, on a version-3 declaration that leaves files out or names something else', () => {
        expect(
            resolveFilesMethod(phone({ CHATIC_APP_CAPABILITIES: { version: 3, checkout: ['apple'], media: 'app' } }))
        ).toBe('page');
        expect(
            resolveFilesMethod(
                phone({ CHATIC_APP_CAPABILITIES: { version: 3, checkout: ['apple'], media: 'app', files: 'cloud' } })
            )
        ).toBe('page');
        expect(warn).toHaveBeenCalledTimes(2);
    });
});
