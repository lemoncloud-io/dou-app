import { buildHostProfile, logger } from '@chatic/bridges';

import { offeredCheckoutMethods, offeredStore, resolveCheckoutMethod } from './checkout';

const post = { postMessage: jest.fn() };

// Hosts as their globals describe them. `capabilities` is set only where a case says so.
const phone = (platform: string, extra: Record<string, unknown> = {}) =>
    buildHostProfile({ ReactNativeWebView: post, CHATIC_APP_PLATFORM: platform, ...extra });
const desktop = (extra: Record<string, unknown> = {}) =>
    buildHostProfile({ ChaticMessageHandler: post, CHATIC_APP_PLATFORM: 'desktop', ...extra });
const browser = (extra: Record<string, unknown> = {}) => buildHostProfile({ ...extra });

describe('resolveCheckoutMethod', () => {
    let warn: jest.SpyInstance;
    beforeEach(() => {
        warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    });
    afterEach(() => warn.mockRestore());

    // A shell that declares nothing is answered exactly as the screens answered before the port:
    // `isNative()` picks the store, `CHATIC_APP_PLATFORM === 'ios'` (any case) picks Apple's.
    describe('the legacy rule', () => {
        it.each([
            ['an iPhone app', phone('ios'), 'apple'],
            ['an iPhone app that spells the platform in capitals', phone('IOS'), 'apple'],
            ['an Android app', phone('android'), 'google'],
            ['a desktop shell, which has a bridge too', desktop(), 'google'],
            ['a browser tab', browser(), 'web'],
            ['a browser tab that somehow carries a platform', browser({ CHATIC_APP_PLATFORM: 'ios' }), 'web'],
        ])('answers %s with %s', (_name, profile, method) => {
            expect(resolveCheckoutMethod(profile)).toBe(method);
        });
    });

    it("takes the first declared method it knows, in the shell's order", () => {
        expect(
            resolveCheckoutMethod(phone('ios', { CHATIC_APP_CAPABILITIES: { version: 1, checkout: ['web', 'apple'] } }))
        ).toBe('web');
        expect(
            resolveCheckoutMethod(
                phone('ios', { CHATIC_APP_CAPABILITIES: { version: 1, checkout: ['paypal', 'google'] } })
            )
        ).toBe('google');
    });

    it('lets a shell with a bridge declare the website, which no legacy answer could', () => {
        expect(resolveCheckoutMethod(desktop({ CHATIC_APP_CAPABILITIES: { version: 1, checkout: ['web'] } }))).toBe(
            'web'
        );
    });

    it('sells nothing on an empty declaration, or one naming only methods it does not know', () => {
        expect(resolveCheckoutMethod(desktop({ CHATIC_APP_CAPABILITIES: { version: 1, checkout: [] } }))).toBe('none');
        expect(resolveCheckoutMethod(desktop({ CHATIC_APP_CAPABILITIES: { version: 1, checkout: ['paypal'] } }))).toBe(
            'none'
        );
    });

    it('sells nothing, and says so, when the declaration leaves checkout out or gives it a non-list', () => {
        expect(resolveCheckoutMethod(phone('ios', { CHATIC_APP_CAPABILITIES: { version: 1 } }))).toBe('none');
        expect(
            resolveCheckoutMethod(phone('ios', { CHATIC_APP_CAPABILITIES: { version: 1, checkout: 'apple' } }))
        ).toBe('none');
        expect(warn).toHaveBeenCalledTimes(2);
    });

    it('sells nothing when the declaration is unreadable', () => {
        expect(resolveCheckoutMethod(phone('ios', { CHATIC_APP_CAPABILITIES: 'apple' }))).toBe('none');
    });
});

describe('offeredCheckoutMethods', () => {
    let warn: jest.SpyInstance;
    beforeEach(() => {
        warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    });
    afterEach(() => warn.mockRestore());

    it("keeps every declared method the page knows, in the shell's order", () => {
        expect(
            offeredCheckoutMethods(
                phone('ios', { CHATIC_APP_CAPABILITIES: { version: 1, checkout: ['web', 'paypal', 'apple'] } })
            )
        ).toEqual(['web', 'apple']);
    });

    it('offers the one legacy method for a host that declares nothing', () => {
        expect(offeredCheckoutMethods(phone('ios'))).toEqual(['apple']);
        expect(offeredCheckoutMethods(browser())).toEqual(['web']);
    });

    it('offers nothing for a declaration that is not a list, and says so', () => {
        expect(
            offeredCheckoutMethods(phone('ios', { CHATIC_APP_CAPABILITIES: { version: 1, checkout: 'apple' } }))
        ).toEqual([]);
        expect(warn).toHaveBeenCalledTimes(1);
    });

    it('names the first store offered, or none where only the website is', () => {
        expect(
            offeredStore(phone('android', { CHATIC_APP_CAPABILITIES: { version: 1, checkout: ['web', 'google'] } }))
        ).toBe('google');
        expect(offeredStore(browser())).toBeUndefined();
    });
});
