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
        ['a phone app', phone(), 'shell'],
        ['a desktop shell, which has a bridge too', buildHostProfile({ ChaticMessageHandler: post }), 'shell'],
        ['a browser tab', browser(), 'browser'],
    ])('answers %s that declares nothing with %s', (_name, profile, method) => {
        expect(resolveFilesMethod(profile)).toBe(method);
    });

    it('leaves version-1 and version-2 declarations, which predate the key, to the legacy rule', () => {
        expect(resolveFilesMethod(phone({ CHATIC_APP_CAPABILITIES: { version: 1, checkout: ['apple'] } }))).toBe(
            'shell'
        );
        expect(
            resolveFilesMethod(phone({ CHATIC_APP_CAPABILITIES: { version: 2, checkout: ['apple'], media: 'shell' } }))
        ).toBe('shell');
        expect(
            resolveFilesMethod(
                browser({ CHATIC_APP_CAPABILITIES: { version: 2, checkout: ['web'], media: 'browser' } })
            )
        ).toBe('browser');
        expect(warn).not.toHaveBeenCalled();
    });

    it('reads what a version-3 declaration says, even against the bridge', () => {
        expect(
            resolveFilesMethod(
                phone({ CHATIC_APP_CAPABILITIES: { version: 3, checkout: [], media: 'shell', files: 'browser' } })
            )
        ).toBe('browser');
        expect(
            resolveFilesMethod(
                browser({ CHATIC_APP_CAPABILITIES: { version: 3, checkout: [], media: 'browser', files: 'shell' } })
            )
        ).toBe('shell');
    });

    it('falls back to the browser, and says so, on a version-3 declaration that leaves files out or names something else', () => {
        expect(
            resolveFilesMethod(phone({ CHATIC_APP_CAPABILITIES: { version: 3, checkout: ['apple'], media: 'shell' } }))
        ).toBe('browser');
        expect(
            resolveFilesMethod(
                phone({ CHATIC_APP_CAPABILITIES: { version: 3, checkout: ['apple'], media: 'shell', files: 'cloud' } })
            )
        ).toBe('browser');
        expect(warn).toHaveBeenCalledTimes(2);
    });
});
