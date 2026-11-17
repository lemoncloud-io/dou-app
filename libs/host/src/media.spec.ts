import { buildHostProfile, logger } from '@chatic/bridges';

import { resolveMediaMethod } from './media';

const post = { postMessage: jest.fn() };
const phone = (extra: Record<string, unknown> = {}) =>
    buildHostProfile({ ReactNativeWebView: post, CHATIC_APP_PLATFORM: 'ios', ...extra });
const browser = (extra: Record<string, unknown> = {}) => buildHostProfile({ ...extra });

describe('resolveMediaMethod', () => {
    let warn: jest.SpyInstance;
    beforeEach(() => {
        warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    });
    afterEach(() => warn.mockRestore());

    // The answer the page gave before the port: `isNative()` meant the app picks.
    it.each([
        ['a phone app', phone(), 'app'],
        ['a desktop shell, which has a bridge too', buildHostProfile({ ChaticMessageHandler: post }), 'app'],
        ['a browser tab', browser(), 'page'],
    ])('answers %s that declares nothing with %s', (_name, profile, method) => {
        expect(resolveMediaMethod(profile)).toBe(method);
    });

    it('leaves a version-1 declaration, which predates the key, to the legacy rule', () => {
        expect(resolveMediaMethod(phone({ CHATIC_APP_CAPABILITIES: { version: 1, checkout: ['apple'] } }))).toBe('app');
        expect(warn).not.toHaveBeenCalled();
    });

    it('reads what a version-2 declaration says, even against the bridge', () => {
        expect(
            resolveMediaMethod(phone({ CHATIC_APP_CAPABILITIES: { version: 2, checkout: [], media: 'page' } }))
        ).toBe('page');
        expect(
            resolveMediaMethod(browser({ CHATIC_APP_CAPABILITIES: { version: 2, checkout: [], media: 'app' } }))
        ).toBe('app');
    });

    it('falls back to the page, and says so, on a version-2 declaration that leaves media out or names something else', () => {
        expect(resolveMediaMethod(phone({ CHATIC_APP_CAPABILITIES: { version: 2, checkout: ['apple'] } }))).toBe(
            'page'
        );
        expect(
            resolveMediaMethod(phone({ CHATIC_APP_CAPABILITIES: { version: 2, checkout: ['apple'], media: 'camera' } }))
        ).toBe('page');
        expect(warn).toHaveBeenCalledTimes(2);
    });
});
