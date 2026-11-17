import {
    CHECKOUT_STORE_KEY,
    FAKE_PRICE,
    capabilitiesScript,
    checkoutChoice,
    fakeProducts,
    fakeStore,
    FILES_STORE_KEY,
    filesChoice,
    MEDIA_STORE_KEY,
    launch,
    mediaChoice,
    withCheckoutDeclaration,
} from './checkout';

import type { ProtocolPreset } from '@lemoncloud/hybrid-shell';

const skus = { ios: ['pro_tier_01', 'pro_tier_02'], android: ['dou_pro_subscription'], androidPlans: ['pro-tier-01'] };

afterEach(() => {
    launch.env = undefined;
    launch.choice = undefined;
});

describe('checkoutChoice', () => {
    it('makes no choice by default, so the shell declares nothing', () => {
        expect(checkoutChoice(new Map(), '')).toBeUndefined();
        expect(checkoutChoice(undefined, undefined)).toBeUndefined();
    });

    it('takes DOU_SHELL_CHECKOUT, in any case', () => {
        expect(checkoutChoice(new Map(), 'Web')).toBe('web');
        expect(checkoutChoice(new Map(), ' google ')).toBe('google');
    });

    it('prefers a choice kept in the shell store, which a scenario can change between launches', () => {
        expect(checkoutChoice(new Map([[CHECKOUT_STORE_KEY, 'none']]), 'web')).toBe('none');
    });

    it('ignores a value it does not know', () => {
        expect(checkoutChoice(new Map([[CHECKOUT_STORE_KEY, 'paypal']]), 'stripe')).toBeUndefined();
    });
});

describe('capabilitiesScript', () => {
    it('injects nothing without a choice', () => {
        expect(capabilitiesScript(undefined)).toBe('');
    });

    it('declares the chosen method as version 1, and none as an empty list', () => {
        expect(capabilitiesScript('web')).toContain(
            'window.CHATIC_APP_CAPABILITIES = {"version":1,"checkout":["web"]};'
        );
        expect(capabilitiesScript('none')).toContain('"checkout":[]');
    });
});

describe('fakeStore', () => {
    it('answers only on dev, and only as a store a person picked', () => {
        launch.env = 'dev';
        launch.choice = 'apple';
        expect(fakeStore()).toBe('apple');

        launch.choice = 'web';
        expect(fakeStore()).toBeUndefined();
        launch.choice = undefined;
        expect(fakeStore()).toBeUndefined();

        launch.env = 'prod';
        launch.choice = 'google';
        expect(fakeStore()).toBeUndefined();
    });
});

describe('mediaChoice', () => {
    it('makes no choice by default, and takes DOU_SHELL_MEDIA or the store, the store first', () => {
        expect(mediaChoice(new Map(), '')).toBeUndefined();
        expect(mediaChoice(new Map(), 'Page')).toBe('page');
        expect(mediaChoice(new Map([[MEDIA_STORE_KEY, 'app']]), 'page')).toBe('app');
        expect(mediaChoice(new Map(), 'camera')).toBeUndefined();
    });
});

describe('capabilitiesScript with media', () => {
    it('declares version 2 with the device store when only media is picked', () => {
        expect(capabilitiesScript(undefined, 'page', 'ios')).toContain(
            '{"version":2,"checkout":["apple"],"media":"page"}'
        );
        expect(capabilitiesScript(undefined, 'page', 'android')).toContain('"checkout":["google"]');
    });

    it('keeps a picked checkout beside it', () => {
        expect(capabilitiesScript('web', 'page', 'ios')).toContain('{"version":2,"checkout":["web"],"media":"page"}');
    });
});

describe('filesChoice', () => {
    it('makes no choice by default, and takes DOU_SHELL_FILES or the store, the store first', () => {
        expect(filesChoice(new Map(), '')).toBeUndefined();
        expect(filesChoice(new Map(), 'Page')).toBe('page');
        expect(filesChoice(new Map([[FILES_STORE_KEY, 'app']]), 'page')).toBe('app');
        expect(filesChoice(new Map(), 'cloud')).toBeUndefined();
    });
});

describe('capabilitiesScript with files', () => {
    it('declares version 3 with the device store, and media following files, when only files is picked', () => {
        expect(capabilitiesScript(undefined, undefined, 'ios', 'page')).toContain(
            '{"version":3,"checkout":["apple"],"media":"page","files":"page"}'
        );
        expect(capabilitiesScript(undefined, undefined, 'ios', 'app')).toContain('"media":"app","files":"app"');
        expect(capabilitiesScript(undefined, undefined, 'android', 'page')).toContain('"checkout":["google"]');
    });

    it('keeps a picked checkout and media beside it', () => {
        expect(capabilitiesScript('web', 'page', 'ios', 'app')).toContain(
            '{"version":3,"checkout":["web"],"media":"page","files":"app"}'
        );
    });
});

describe('withCheckoutDeclaration', () => {
    const base = {
        name: 'app-bridge-host',
        globals: () => 'window.BASE = 1;',
        dispatch: () => undefined,
    } as unknown as ProtocolPreset;
    const app = { name: 'chatic' } as never;
    const device = { platform: 'ios' } as never;

    it("keeps the preset's globals and the rest of it, and appends the declaration", () => {
        const preset = withCheckoutDeclaration(base);
        const script = preset.globals(app, device, 'dev', new Map([[CHECKOUT_STORE_KEY, 'web']]));

        expect(script.startsWith('window.BASE = 1;')).toBe(true);
        expect(script).toContain('"checkout":["web"]');
        expect(preset.name).toBe('app-bridge-host');
        expect(preset.dispatch).toBe(base.dispatch);
    });

    it('records the backend it is told, so the virtual store stays shut on prod', () => {
        withCheckoutDeclaration(base).globals(app, device, 'prod', new Map([[CHECKOUT_STORE_KEY, 'google']]));

        expect(launch).toEqual({ env: 'prod', choice: 'google' });
        expect(fakeStore()).toBeUndefined();
    });
});

describe('fakeProducts', () => {
    it("lists one App Store product per SKU, keyed by its id the way the web joins Apple's", () => {
        expect(fakeProducts('apple', skus)).toEqual([
            expect.objectContaining({ id: 'pro_tier_01', displayPrice: FAKE_PRICE }),
            expect.objectContaining({ id: 'pro_tier_02', displayPrice: FAKE_PRICE }),
        ]);
    });

    it('lists one Google base plan per plan under the parent subscription, with a base offer token', () => {
        expect(fakeProducts('google', skus)).toEqual([
            expect.objectContaining({
                id: 'dou_pro_subscription',
                basePlanId: 'pro-tier-01',
                displayPrice: FAKE_PRICE,
                androidOfferToken: { freeTrial: null, base: 'virtual-offer-pro-tier-01' },
            }),
        ]);
    });
});
