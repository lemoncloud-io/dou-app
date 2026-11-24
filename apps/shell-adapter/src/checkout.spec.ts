import {
    CHECKOUT_STORE_KEY,
    checkoutPlan,
    HARNESS_GLOBAL,
    harnessScript,
    LOCAL_WEB_DISPLAY,
    originOf,
    probeOrigin,
    PROD_WEB_DISPLAY,
    resetProbes,
    SANDBOX_DISPLAY,
    SANDBOX_IN_APP_DISPLAY,
    SANDBOX_STORE_KEY,
    sandboxChoice,
    SUBSCRIPTION_WEB_STORE_KEY,
    subscriptionWebChoice,
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
    launch.platform = undefined;
    launch.plan = undefined;
    launch.store = undefined;
});

describe('checkoutChoice', () => {
    it("takes the device's store by default, as the mobile app is set up", () => {
        expect(checkoutChoice(new Map(), '')).toBe('store');
        expect(checkoutChoice(undefined, undefined)).toBe('store');
    });

    it('still takes the store names and the legacy choice', () => {
        expect(checkoutChoice(new Map(), 'apple')).toBe('apple');
        expect(checkoutChoice(new Map([[CHECKOUT_STORE_KEY, 'legacy']]), undefined)).toBe('legacy');
    });

    it('takes DOU_SHELL_CHECKOUT, in any case', () => {
        expect(checkoutChoice(new Map(), 'Web')).toBe('web');
        expect(checkoutChoice(new Map(), ' google ')).toBe('google');
    });

    it('prefers a choice kept in the shell store, which a scenario can change between launches', () => {
        expect(checkoutChoice(new Map([[CHECKOUT_STORE_KEY, 'none']]), 'web')).toBe('none');
    });

    it('ignores a value it does not know', () => {
        expect(checkoutChoice(new Map([[CHECKOUT_STORE_KEY, 'paypal']]), 'stripe')).toBe('store');
    });
});

describe('checkoutPlan — the combination table', () => {
    const iphone = { platform: 'ios' };
    const web = 'http://localhost:5004';

    it.each([
        ['dev', 'store', false, ['apple'], { version: 1, sandbox: false }, true, undefined],
        ['dev', 'store', true, ['apple'], { version: 1, sandbox: true }, true, SANDBOX_IN_APP_DISPLAY],
        ['dev', 'web', false, ['web'], { version: 1, sandbox: false, subscriptionWeb: web }, false, undefined],
        ['dev', 'web', true, ['web'], { version: 1, sandbox: true, subscriptionWeb: web }, false, SANDBOX_DISPLAY],
        ['prod', 'store', true, ['apple'], { version: 1, sandbox: false }, false, undefined],
        ['prod', 'web', true, ['web'], { version: 1, sandbox: false }, false, PROD_WEB_DISPLAY],
        ['localhost', 'store', true, ['apple'], undefined, false, undefined],
        ['localhost', 'web', true, [], undefined, false, LOCAL_WEB_DISPLAY],
        ['dev', 'none', true, [], undefined, false, undefined],
        ['prod', 'none', false, [], undefined, false, undefined],
        ['localhost', 'none', false, [], undefined, false, undefined],
    ] as const)('%s · %s · sandbox %s declares %j', (env, choice, sandbox, declared, harness, imitated, display) => {
        const plan = checkoutPlan({ env, choice, sandbox, subscriptionWeb: web, ...iphone });
        expect(plan.declared).toEqual(declared);
        expect(plan.harness).toEqual(harness);
        expect(plan.storeImitated).toBe(imitated);
        expect(plan.display).toBe(display);
    });

    it("declares the device preset's store for store: Apple on an iPhone, Google on Android", () => {
        expect(checkoutPlan({ env: 'dev', choice: 'store', platform: 'android' }).declared).toEqual(['google']);
    });

    it('declares a picked store as it is, and says when it differs from the device', () => {
        const plan = checkoutPlan({ env: 'dev', choice: 'google', platform: 'ios' });
        expect(plan.declared).toEqual(['google']);
        expect(plan.display).toBe('google store on a ios device');
    });

    it('never carries the sandbox to prod, whatever was kept', () => {
        expect(checkoutPlan({ env: 'prod', choice: 'web', platform: 'ios', sandbox: true }).harness?.sandbox).toBe(
            false
        );
        expect(checkoutPlan({ env: 'prod', choice: 'web', platform: 'ios', sandbox: true }).sandbox).toBe(false);
    });

    it('leaves the subscription website out when none answered, so the web uses the deployed one', () => {
        expect(checkoutPlan({ env: 'dev', choice: 'web', platform: 'ios' }).harness).toEqual({
            version: 1,
            sandbox: false,
        });
    });

    it('declares nothing for legacy, as an app built before declarations', () => {
        expect(checkoutPlan({ env: 'dev', choice: 'legacy', platform: 'ios' })).toMatchObject({
            declared: undefined,
            harness: undefined,
            storeImitated: false,
        });
    });
});

describe('capabilitiesScript', () => {
    it('injects nothing for legacy with nothing else picked', () => {
        expect(capabilitiesScript(undefined)).toBe('');
    });

    it('declares the planned methods as version 1, and none as an empty list', () => {
        expect(capabilitiesScript(['web'])).toContain(
            'window.CHATIC_APP_CAPABILITIES = {"version":1,"checkout":["web"]};'
        );
        expect(capabilitiesScript([])).toContain('"checkout":[]');
    });
});

describe('harnessScript', () => {
    it('sets the harness global beside the declaration, and nothing without one', () => {
        expect(harnessScript({ version: 1, sandbox: true })).toContain(
            `window.${HARNESS_GLOBAL} = {"version":1,"sandbox":true};`
        );
        expect(harnessScript(undefined)).toBe('');
    });
});

describe('sandboxChoice', () => {
    it('is off unless the store keeps it on', () => {
        expect(sandboxChoice(new Map())).toBe(false);
        expect(sandboxChoice(new Map([[SANDBOX_STORE_KEY, 'yes']]))).toBe(false);
        expect(sandboxChoice(new Map([[SANDBOX_STORE_KEY, true]]))).toBe(true);
    });
});

describe('subscriptionWebChoice', () => {
    afterEach(() => resetProbes());

    it('takes the origin of the launch value, which the shell checked when it started', () => {
        expect(subscriptionWebChoice(new Map(), 'http://localhost:5004/subscription')).toBe('http://localhost:5004');
        expect(subscriptionWebChoice(new Map(), '')).toBeUndefined();
        expect(originOf('ftp://example.com')).toBeUndefined();
    });

    it('lets a kept origin win once it has answered, and asks it first', async () => {
        const kept = new Map([[SUBSCRIPTION_WEB_STORE_KEY, 'http://localhost:5014']]);
        const request = vi.fn(async () => new Response(''));
        await probeOrigin('http://localhost:5014', request as unknown as typeof fetch);
        expect(subscriptionWebChoice(kept, 'http://localhost:5004')).toBe('http://localhost:5014');
    });

    it('falls back to the launch value while a kept origin does not answer', async () => {
        const kept = new Map([[SUBSCRIPTION_WEB_STORE_KEY, 'http://localhost:5099']]);
        await probeOrigin('http://localhost:5099', (async () => {
            throw new TypeError('refused');
        }) as unknown as typeof fetch);
        expect(subscriptionWebChoice(kept, 'http://localhost:5004')).toBe('http://localhost:5004');
    });
});

describe('fakeStore', () => {
    const launchOn = (env: 'dev' | 'prod' | 'localhost', choice: 'store' | 'apple' | 'web' | 'legacy') => {
        launch.env = env;
        launch.plan = checkoutPlan({ env, choice, platform: 'ios' });
    };

    it('answers on dev for a store checkout, the default included', () => {
        launchOn('dev', 'store');
        expect(fakeStore()).toBe('apple');
        launchOn('dev', 'apple');
        expect(fakeStore()).toBe('apple');
    });

    it('stays shut for web, legacy, prod and localhost', () => {
        launchOn('dev', 'web');
        expect(fakeStore()).toBeUndefined();
        launchOn('dev', 'legacy');
        expect(fakeStore()).toBeUndefined();
        launchOn('prod', 'store');
        expect(fakeStore()).toBeUndefined();
        launchOn('localhost', 'store');
        expect(fakeStore()).toBeUndefined();
    });
});

describe('mediaChoice', () => {
    it('makes no choice by default, and takes DOU_SHELL_MEDIA or the store, the store first', () => {
        expect(mediaChoice(new Map(), '')).toBeUndefined();
        expect(mediaChoice(new Map(), 'Browser')).toBe('browser');
        expect(mediaChoice(new Map([[MEDIA_STORE_KEY, 'shell']]), 'browser')).toBe('shell');
        expect(mediaChoice(new Map(), 'camera')).toBeUndefined();
    });

    it('ignores the old spellings app and page, and says what they are called now', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect(mediaChoice(new Map(), 'page')).toBeUndefined();
        expect(filesChoice(new Map([[FILES_STORE_KEY, 'app']]), undefined)).toBeUndefined();
        expect(warn).toHaveBeenCalledWith("[shell] 'page' is now 'browser'; this choice is ignored");
        expect(warn).toHaveBeenCalledWith("[shell] 'app' is now 'shell'; this choice is ignored");
        warn.mockRestore();
    });
});

describe('capabilitiesScript with media', () => {
    it('declares version 2 with the device store when only media is picked', () => {
        expect(capabilitiesScript(undefined, 'browser', 'ios')).toContain(
            '{"version":2,"checkout":["apple"],"media":"browser"}'
        );
        expect(capabilitiesScript(undefined, 'browser', 'android')).toContain('"checkout":["google"]');
    });

    it('keeps a picked checkout beside it', () => {
        expect(capabilitiesScript(['web'], 'browser', 'ios')).toContain(
            '{"version":2,"checkout":["web"],"media":"browser"}'
        );
    });
});

describe('filesChoice', () => {
    it('makes no choice by default, and takes DOU_SHELL_FILES or the store, the store first', () => {
        expect(filesChoice(new Map(), '')).toBeUndefined();
        expect(filesChoice(new Map(), 'Browser')).toBe('browser');
        expect(filesChoice(new Map([[FILES_STORE_KEY, 'shell']]), 'browser')).toBe('shell');
        expect(filesChoice(new Map(), 'cloud')).toBeUndefined();
    });
});

describe('capabilitiesScript with files', () => {
    it('declares version 3 with the device store, and media following files, when only files is picked', () => {
        expect(capabilitiesScript(undefined, undefined, 'ios', 'browser')).toContain(
            '{"version":3,"checkout":["apple"],"media":"browser","files":"browser"}'
        );
        expect(capabilitiesScript(undefined, undefined, 'ios', 'shell')).toContain('"media":"shell","files":"shell"');
        expect(capabilitiesScript(undefined, undefined, 'android', 'browser')).toContain('"checkout":["google"]');
    });

    it('keeps a picked checkout and media beside it', () => {
        expect(capabilitiesScript(['web'], 'browser', 'ios', 'shell')).toContain(
            '{"version":3,"checkout":["web"],"media":"browser","files":"shell"}'
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
        expect(script).toContain(`window.${HARNESS_GLOBAL} = {"version":1,"sandbox":false};`);
        expect(preset.name).toBe('app-bridge-host');
        expect(preset.dispatch).toBe(base.dispatch);
    });

    it('records the backend it is told, so the virtual store stays shut on prod', () => {
        withCheckoutDeclaration(base).globals(app, device, 'prod', new Map([[CHECKOUT_STORE_KEY, 'google']]));

        expect(launch).toMatchObject({ env: 'prod', choice: 'google', platform: 'ios' });
        expect(fakeStore()).toBeUndefined();
    });

    it('declares the device store with no choice, and keeps no sandbox against prod', () => {
        const script = withCheckoutDeclaration(base).globals(
            app,
            device,
            'prod',
            new Map<string, unknown>([[SANDBOX_STORE_KEY, true]])
        );
        expect(script).toContain('"checkout":["apple"]');
        expect(script).toContain('"sandbox":false');
    });

    it('injects no harness on localhost', () => {
        const script = withCheckoutDeclaration(base).globals(app, device, 'localhost', new Map());
        expect(script).not.toContain(HARNESS_GLOBAL);
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
