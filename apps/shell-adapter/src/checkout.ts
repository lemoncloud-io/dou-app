import type { IapProductSubscription, WebMessageResponse } from '@chatic/bridge-messages';
import type { ProtocolPreset } from '@lemoncloud/hybrid-shell';

/**
 * How this shell sells, as a person picks it. The shell declares it to the web in
 * `CHATIC_APP_CAPABILITIES.checkout`, the way an app declares what it can do, so the web's own choice
 * between the store path and the website's checkout runs unchanged.
 */
export const SHELL_CHECKOUT_CHOICES = ['apple', 'google', 'web', 'none'] as const;
export type ShellCheckoutChoice = (typeof SHELL_CHECKOUT_CHOICES)[number];

/** Where a handler or a scenario keeps a choice; read at every launch, so it applies at the next one. */
export const CHECKOUT_STORE_KEY = 'dou.checkout';

/** What the app sells through the stores, from the mobile app's dev env file (`vite.shell.config.mts`). */
export interface StoreSkus {
    ios: string[];
    android: string[];
    androidPlans: string[];
}

declare const __DOU_SHELL_CHECKOUT__: string | undefined;
declare const __DOU_SHELL_STORE_SKUS__: StoreSkus | undefined;

const isChoice = (value: unknown): value is ShellCheckoutChoice =>
    (SHELL_CHECKOUT_CHOICES as readonly unknown[]).includes(value);

/**
 * The choice for this launch: one a handler or scenario kept in the shell's store first, then
 * `DOU_SHELL_CHECKOUT` from `yarn local`'s environment. No choice means the shell declares nothing, so
 * the web answers as it does for an app built before declarations — the store path, as before.
 */
export const checkoutChoice = (
    store?: ReadonlyMap<string, unknown>,
    fromEnv: string | undefined = typeof __DOU_SHELL_CHECKOUT__ === 'string' ? __DOU_SHELL_CHECKOUT__ : undefined
): ShellCheckoutChoice | undefined => {
    const kept = store?.get(CHECKOUT_STORE_KEY);
    if (isChoice(kept)) return kept;
    const env = fromEnv?.trim().toLowerCase();
    return isChoice(env) ? env : undefined;
};

/** The declaration the shell injects for a choice, after the preset's own globals; nothing for none. */
export const capabilitiesScript = (choice: ShellCheckoutChoice | undefined): string => {
    if (!choice) return '';
    const declaration = { version: 1, checkout: choice === 'none' ? [] : [choice] };
    return `\nwindow.CHATIC_APP_CAPABILITIES = ${JSON.stringify(declaration)};\n`;
};

/**
 * The launch the fake store answers for, written by the preset's `globals` at every launch. The
 * handlers have no other way to learn the backend: the fake store answers on dev only, because a fake
 * receipt must never reach the production server.
 */
export const launch: { env: 'dev' | 'prod' | undefined; choice: ShellCheckoutChoice | undefined } = {
    env: undefined,
    choice: undefined,
};

/**
 * A preset that declares this shell's checkout: the given preset's globals, then
 * `CHATIC_APP_CAPABILITIES` for the choice. It also records the launch's backend and choice, which the
 * virtual store needs and the handlers cannot learn any other way.
 */
export const withCheckoutDeclaration = (preset: ProtocolPreset): ProtocolPreset =>
    Object.assign(Object.create(preset) as ProtocolPreset, {
        name: preset.name,
        globals: (...args: Parameters<ProtocolPreset['globals']>) => {
            const [, , env, store] = args;
            const choice = checkoutChoice(store);
            launch.env = env;
            launch.choice = choice;
            return preset.globals(...args) + capabilitiesScript(choice);
        },
    });

/** Whether the fake store answers now, and as which store. */
export const fakeStore = (): 'apple' | 'google' | undefined => {
    if (launch.env !== 'dev') return undefined;
    return launch.choice === 'apple' || launch.choice === 'google' ? launch.choice : undefined;
};

export const storeSkus = (): StoreSkus =>
    typeof __DOU_SHELL_STORE_SKUS__ === 'object' && __DOU_SHELL_STORE_SKUS__
        ? __DOU_SHELL_STORE_SKUS__
        : { ios: [], android: [], androidPlans: [] };

/** A purchase as the app reports one, with a receipt no store issued. */
export type FakePurchase = WebMessageResponse<'FetchCurrentPurchases'>['data']['purchases'][number];

export const fakePurchase = (store: 'apple' | 'google', productId: string, now = Date.now()): FakePurchase =>
    ({
        productId,
        purchaseToken: `virtual-receipt-${now}`,
        transactionId: `virtual-${now}`,
        platform: store === 'apple' ? 'ios' : 'android',
    }) as unknown as FakePurchase;

/** A price no one could take for a real one. */
export const FAKE_PRICE = '₩0 (virtual store)';

/**
 * The store's catalog as the app hands it over: one product per App Store SKU, or, on Google, one per
 * base plan under the parent subscription, each with a base offer token the purchase sends back.
 */
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
