import type { IapProductSubscription, WebMessageResponse } from '@chatic/bridge-messages';
import type { ProtocolPreset, ShellEnv } from '@lemoncloud/hybrid-shell';

export const SHELL_CHECKOUT_CHOICES = ['apple', 'google', 'web', 'none'] as const;
export type ShellCheckoutChoice = (typeof SHELL_CHECKOUT_CHOICES)[number];

export const CHECKOUT_STORE_KEY = 'dou.checkout';

export interface StoreSkus {
    ios: string[];
    android: string[];
    androidPlans: string[];
}

declare const __DOU_SHELL_CHECKOUT__: string | undefined;
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
): ShellCheckoutChoice | undefined => {
    const kept = store?.get(CHECKOUT_STORE_KEY);
    if (isChoice(kept)) return kept;
    const env = fromEnv?.trim().toLowerCase();
    return isChoice(env) ? env : undefined;
};

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

export const capabilitiesScript = (
    checkout: ShellCheckoutChoice | undefined,
    media: ShellMediaChoice | undefined = undefined,
    platform: string | undefined = undefined,
    files: ShellFilesChoice | undefined = undefined
): string => {
    if (!checkout && !media && !files) return '';
    const methods = (choice: ShellCheckoutChoice) => (choice === 'none' ? [] : [choice]);
    const store = (): ShellCheckoutChoice => checkout ?? (platform === 'ios' ? 'apple' : 'google');
    const declaration = files
        ? { version: 3, checkout: methods(store()), media: media ?? files, files }
        : media
          ? { version: 2, checkout: methods(store()), media }
          : { version: 1, checkout: methods(checkout as ShellCheckoutChoice) };
    return `\nwindow.CHATIC_APP_CAPABILITIES = ${JSON.stringify(declaration)};\n`;
};

export const launch: { env: ShellEnv | undefined; choice: ShellCheckoutChoice | undefined } = {
    env: undefined,
    choice: undefined,
};

export const withCheckoutDeclaration = (preset: ProtocolPreset): ProtocolPreset =>
    Object.assign(Object.create(preset) as ProtocolPreset, {
        name: preset.name,
        globals: (...args: Parameters<ProtocolPreset['globals']>) => {
            const [, device, env, store] = args;
            const choice = checkoutChoice(store);
            launch.env = env;
            launch.choice = choice;
            return (
                preset.globals(...args) +
                capabilitiesScript(choice, mediaChoice(store), device.platform, filesChoice(store))
            );
        },
    });

export const fakeStore = (): 'apple' | 'google' | undefined => {
    if (launch.env !== 'dev') return undefined;
    return launch.choice === 'apple' || launch.choice === 'google' ? launch.choice : undefined;
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
