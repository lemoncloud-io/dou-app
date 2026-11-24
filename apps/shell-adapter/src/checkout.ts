import type { IapProductSubscription, WebMessageResponse } from '@chatic/bridge-messages';
import type { ProtocolPreset, ShellEnv } from '@lemoncloud/hybrid-shell';

export const SHELL_CHECKOUT_CHOICES = ['store', 'apple', 'google', 'web', 'none', 'legacy'] as const;
export type ShellCheckoutChoice = (typeof SHELL_CHECKOUT_CHOICES)[number];

export const CHECKOUT_STORE_KEY = 'dou.checkout';
export const SANDBOX_STORE_KEY = 'dou.sandbox';
export const SUBSCRIPTION_WEB_STORE_KEY = 'dou.subscriptionWeb';

const DEFAULT_CHECKOUT: ShellCheckoutChoice = 'store';

export interface StoreSkus {
    ios: string[];
    android: string[];
    androidPlans: string[];
}

declare const __DOU_SHELL_CHECKOUT__: string | undefined;
declare const __DOU_SHELL_SUBSCRIPTION_WEB__: string | undefined;
declare const __DOU_SHELL_MEDIA__: string | undefined;
declare const __DOU_SHELL_FILES__: string | undefined;

export const SHELL_MEDIA_CHOICES = ['shell', 'browser'] as const;
export type ShellMediaChoice = (typeof SHELL_MEDIA_CHOICES)[number];

export const MEDIA_STORE_KEY = 'dou.media';

export const SHELL_FILES_CHOICES = ['shell', 'browser'] as const;
export type ShellFilesChoice = (typeof SHELL_FILES_CHOICES)[number];

export const FILES_STORE_KEY = 'dou.files';
declare const __DOU_SHELL_STORE_SKUS__: StoreSkus | undefined;

const isChoice = (value: unknown): value is ShellCheckoutChoice =>
    (SHELL_CHECKOUT_CHOICES as readonly unknown[]).includes(value);

export const checkoutChoice = (
    store?: ReadonlyMap<string, unknown>,
    fromEnv: string | undefined = typeof __DOU_SHELL_CHECKOUT__ === 'string' ? __DOU_SHELL_CHECKOUT__ : undefined
): ShellCheckoutChoice => {
    const kept = store?.get(CHECKOUT_STORE_KEY);
    if (isChoice(kept)) return kept;
    const env = fromEnv?.trim().toLowerCase();
    return isChoice(env) ? env : DEFAULT_CHECKOUT;
};

export const sandboxChoice = (store?: ReadonlyMap<string, unknown>): boolean => store?.get(SANDBOX_STORE_KEY) === true;

export const mediaChoice = (
    store?: ReadonlyMap<string, unknown>,
    fromEnv: string | undefined = typeof __DOU_SHELL_MEDIA__ === 'string' ? __DOU_SHELL_MEDIA__ : undefined
): ShellMediaChoice | undefined => keptOrEnv(SHELL_MEDIA_CHOICES, store?.get(MEDIA_STORE_KEY), fromEnv);

export const filesChoice = (
    store?: ReadonlyMap<string, unknown>,
    fromEnv: string | undefined = typeof __DOU_SHELL_FILES__ === 'string' ? __DOU_SHELL_FILES__ : undefined
): ShellFilesChoice | undefined => keptOrEnv(SHELL_FILES_CHOICES, store?.get(FILES_STORE_KEY), fromEnv);

const RENAMED_CHOICES: Readonly<Record<string, string>> = { app: 'shell', page: 'browser' };

const keptOrEnv = <T extends string>(
    choices: readonly T[],
    kept: unknown,
    fromEnv: string | undefined
): T | undefined => {
    if ((choices as readonly unknown[]).includes(kept)) return kept as T;
    const env = fromEnv?.trim().toLowerCase();
    if ((choices as readonly unknown[]).includes(env)) return env as T;
    for (const old of [kept, env]) {
        if (typeof old === 'string' && old in RENAMED_CHOICES) {
            console.warn(`[shell] '${old}' is now '${RENAMED_CHOICES[old]}'; this choice is ignored`);
        }
    }
    return undefined;
};

export type DeclaredMethod = 'apple' | 'google' | 'web';
export type CheckoutNotice = 'use-web' | 'local-no-payment';

export interface ShellHarness {
    version: 1;
    sandbox: boolean;
    subscriptionWeb?: string;
}

export interface CheckoutPlan {
    chosen: ShellCheckoutChoice;
    declared: DeclaredMethod[] | undefined;
    harness: ShellHarness | undefined;
    storeImitated: boolean;
    sandbox: boolean;
    display: string | undefined;
}

interface CheckoutPlanInput {
    env: ShellEnv | undefined;
    choice: ShellCheckoutChoice;
    platform: string | undefined;
    sandbox?: boolean;
    subscriptionWeb?: string;
}

export const SANDBOX_DISPLAY = 'SANDBOX';
export const SANDBOX_IN_APP_DISPLAY = 'SANDBOX (in-app: imitated)';
export const PROD_WEB_DISPLAY = 'Real payment — pressing pay charges for real';
export const LOCAL_WEB_DISPLAY = 'The local backend has no payment server';

const deviceStore = (platform: string | undefined): 'apple' | 'google' => (platform === 'ios' ? 'apple' : 'google');

const isStoreChoice = (choice: ShellCheckoutChoice): choice is 'store' | 'apple' | 'google' =>
    choice === 'store' || choice === 'apple' || choice === 'google';

export const checkoutPlan = ({
    env,
    choice,
    platform,
    sandbox = false,
    subscriptionWeb,
}: CheckoutPlanInput): CheckoutPlan => {
    const onDev = env === 'dev';
    const sandboxOn = onDev && sandbox;
    const plan = (declared: DeclaredMethod[] | undefined, rest: Partial<CheckoutPlan> = {}): CheckoutPlan => ({
        chosen: choice,
        declared,
        harness: undefined,
        storeImitated: false,
        sandbox: false,
        display: undefined,
        ...rest,
    });
    const harness = (extra: Partial<ShellHarness> = {}): ShellHarness => ({ version: 1, sandbox: sandboxOn, ...extra });

    if (choice === 'none') return plan([]);
    if (choice === 'legacy') return plan(undefined);
    if (isStoreChoice(choice)) {
        const store = choice === 'store' ? deviceStore(platform) : choice;
        const differs =
            store !== deviceStore(platform) ? `${store} store on a ${platform ?? 'unknown'} device` : undefined;
        if (env === 'localhost') return plan([store], { display: differs });
        return plan([store], {
            harness: harness(),
            storeImitated: onDev,
            sandbox: sandboxOn,
            display: [sandboxOn ? SANDBOX_IN_APP_DISPLAY : undefined, differs].filter(Boolean).join(' · ') || undefined,
        });
    }
    if (env === 'localhost') return plan([], { display: LOCAL_WEB_DISPLAY });
    if (!onDev) return plan(['web'], { harness: harness(), display: PROD_WEB_DISPLAY });
    return plan(['web'], {
        harness: harness(subscriptionWeb ? { subscriptionWeb } : {}),
        sandbox: sandboxOn,
        display: sandboxOn ? SANDBOX_DISPLAY : undefined,
    });
};

export const capabilitiesScript = (
    checkout: DeclaredMethod[] | undefined,
    media: ShellMediaChoice | undefined = undefined,
    platform: string | undefined = undefined,
    files: ShellFilesChoice | undefined = undefined
): string => {
    if (!checkout && !media && !files) return '';
    const methods = checkout ?? [deviceStore(platform)];
    const declaration = files
        ? { version: 3, checkout: methods, media: media ?? files, files }
        : media
          ? { version: 2, checkout: methods, media }
          : { version: 1, checkout: methods };
    return `\nwindow.CHATIC_APP_CAPABILITIES = ${JSON.stringify(declaration)};\n`;
};

export const HARNESS_GLOBAL = 'CHATIC_SHELL_HARNESS';

export const harnessScript = (harness: ShellHarness | undefined): string =>
    harness ? `\nwindow.${HARNESS_GLOBAL} = ${JSON.stringify(harness)};\n` : '';

const subscriptionWebFromEnv = (): string | undefined =>
    typeof __DOU_SHELL_SUBSCRIPTION_WEB__ === 'string' && __DOU_SHELL_SUBSCRIPTION_WEB__
        ? __DOU_SHELL_SUBSCRIPTION_WEB__
        : undefined;

const answered = new Map<string, boolean | Promise<boolean>>();

export const probeOrigin = (origin: string, request: typeof fetch = globalThis.fetch): Promise<boolean> => {
    const known = answered.get(origin);
    if (known !== undefined) return Promise.resolve(known);
    const asked = request(origin, { mode: 'no-cors', signal: AbortSignal.timeout(2000) }).then(
        () => true,
        () => false
    );
    answered.set(origin, asked);
    void asked.then(ok => answered.set(origin, ok));
    return asked;
};

export const resetProbes = (): void => answered.clear();

export const originOf = (value: unknown): string | undefined => {
    if (typeof value !== 'string' || !value.trim()) return undefined;
    try {
        const url = new URL(value.trim());
        return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : undefined;
    } catch {
        return undefined;
    }
};

export const subscriptionWebChoice = (
    store?: ReadonlyMap<string, unknown>,
    fromEnv: string | undefined = subscriptionWebFromEnv()
): string | undefined => {
    const kept = originOf(store?.get(SUBSCRIPTION_WEB_STORE_KEY));
    if (kept) {
        const known = answered.get(kept);
        if (known === true) return kept;
        if (known === undefined) void probeOrigin(kept);
    }
    return originOf(fromEnv);
};

export const launch: {
    env: ShellEnv | undefined;
    choice: ShellCheckoutChoice | undefined;
    platform: string | undefined;
    plan: CheckoutPlan | undefined;
    store: Map<string, unknown> | undefined;
} = {
    env: undefined,
    choice: undefined,
    platform: undefined,
    plan: undefined,
    store: undefined,
};

export const withCheckoutDeclaration = (preset: ProtocolPreset): ProtocolPreset =>
    Object.assign(Object.create(preset) as ProtocolPreset, {
        name: preset.name,
        globals: (...args: Parameters<ProtocolPreset['globals']>) => {
            const [, device, env, store] = args;
            const choice = checkoutChoice(store);
            const plan = checkoutPlan({
                env,
                choice,
                platform: device.platform,
                sandbox: sandboxChoice(store),
                subscriptionWeb: subscriptionWebChoice(store),
            });
            launch.env = env;
            launch.choice = choice;
            launch.platform = device.platform;
            launch.plan = plan;
            launch.store = store instanceof Map ? (store as Map<string, unknown>) : launch.store;
            return (
                preset.globals(...args) +
                capabilitiesScript(plan.declared, mediaChoice(store), device.platform, filesChoice(store)) +
                harnessScript(plan.harness)
            );
        },
    });

export const fakeStore = (): 'apple' | 'google' | undefined => {
    const plan = launch.plan;
    if (launch.env !== 'dev' || !plan?.storeImitated) return undefined;
    const store = plan.declared?.[0];
    return store === 'apple' || store === 'google' ? store : undefined;
};

export const storeSkus = (): StoreSkus =>
    typeof __DOU_SHELL_STORE_SKUS__ === 'object' && __DOU_SHELL_STORE_SKUS__
        ? __DOU_SHELL_STORE_SKUS__
        : { ios: [], android: [], androidPlans: [] };

export type FakePurchase = WebMessageResponse<'FetchCurrentPurchases'>['data']['purchases'][number];

export const fakePurchase = (store: 'apple' | 'google', productId: string, now = Date.now()): FakePurchase =>
    ({
        productId,
        purchaseToken: `virtual-receipt-${now}`,
        transactionId: `virtual-${now}`,
        platform: store === 'apple' ? 'ios' : 'android',
    }) as unknown as FakePurchase;

export const FAKE_PRICE = '₩0 (virtual store)';

export const fakeProducts = (store: 'apple' | 'google', skus: StoreSkus = storeSkus()): IapProductSubscription[] => {
    const shared = { displayPrice: FAKE_PRICE, currency: 'KRW', billingPeriod: 'P1M', periodUnit: 'month' as const };
    if (store === 'apple') {
        return skus.ios.map(id => ({ ...shared, id, displayName: id }) as unknown as IapProductSubscription);
    }
    const parent = skus.android[0] ?? '';
    return skus.androidPlans.map(
        basePlanId =>
            ({
                ...shared,
                id: parent,
                basePlanId,
                displayName: basePlanId,
                androidOfferToken: { freeTrial: null, base: `virtual-offer-${basePlanId}` },
            }) as unknown as IapProductSubscription
    );
};
