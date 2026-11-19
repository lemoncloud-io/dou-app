import type { IapProductSubscription, WebMessageResponse } from '@chatic/bridge-messages';
import type { ProtocolPreset, ShellEnv } from '@lemoncloud/hybrid-shell';

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
declare const __DOU_SHELL_MEDIA__: string | undefined;
declare const __DOU_SHELL_FILES__: string | undefined;

/** Who picks attachments, as a person picks it: the shell's own picker (`shell`), or the browser's input (`browser`). */
export const SHELL_MEDIA_CHOICES = ['shell', 'browser'] as const;
export type ShellMediaChoice = (typeof SHELL_MEDIA_CHOICES)[number];

/** Where a handler or a scenario keeps a media choice; read at every launch, like `dou.checkout`. */
export const MEDIA_STORE_KEY = 'dou.media';

/** Who moves a message's files, as a person picks it: the shell's transfer module (`shell`), or the browser's requests (`browser`). */
export const SHELL_FILES_CHOICES = ['shell', 'browser'] as const;
export type ShellFilesChoice = (typeof SHELL_FILES_CHOICES)[number];

/** Where a handler or a scenario keeps a files choice; read at every launch, like `dou.checkout`. */
export const FILES_STORE_KEY = 'dou.files';
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

/**
 * The media choice for this launch: `dou.media` in the shell's store first, then `DOU_SHELL_MEDIA`. No
 * choice leaves media to the web's rule for a declaration without it — the shell picks, as before.
 */
export const mediaChoice = (
    store?: ReadonlyMap<string, unknown>,
    fromEnv: string | undefined = typeof __DOU_SHELL_MEDIA__ === 'string' ? __DOU_SHELL_MEDIA__ : undefined
): ShellMediaChoice | undefined => keptOrEnv(SHELL_MEDIA_CHOICES, store?.get(MEDIA_STORE_KEY), fromEnv);

/**
 * The files choice for this launch: `dou.files` in the shell's store first, then `DOU_SHELL_FILES`. No
 * choice leaves files to the web's rule for a declaration without it — the shell moves them, as before.
 */
export const filesChoice = (
    store?: ReadonlyMap<string, unknown>,
    fromEnv: string | undefined = typeof __DOU_SHELL_FILES__ === 'string' ? __DOU_SHELL_FILES__ : undefined
): ShellFilesChoice | undefined => keptOrEnv(SHELL_FILES_CHOICES, store?.get(FILES_STORE_KEY), fromEnv);

/** The names the media and files choices had before they were `shell` and `browser`. */
const RENAMED_CHOICES: Readonly<Record<string, string>> = { app: 'shell', page: 'browser' };

/**
 * A choice kept in the store if it is one of `choices`, else the environment's, else none.
 *
 * An old spelling (`app`, `page`) is not taken as the new one: the shell declares one vocabulary. It
 * still says so, because a person who started the shell the way they always did would otherwise get
 * "no choice" with nothing to explain why.
 */
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

/**
 * The declaration the shell injects for its choices, after the preset's own globals; nothing when
 * nothing was picked. It takes the lowest version that holds what was picked: `checkout` alone is
 * version 1, `media` takes 2, `files` takes 3. A declaration has to carry every key its version
 * requires — one that is missing reads as a bug, not as "the legacy answer" — so a key not picked is
 * declared as what the web would answer anyway for this shell, which has a bridge: the device's store.
 * An unpicked `media` follows `files`: what the app's picker hands back for a video or a document is a
 * file in the app's folder, which only the app's transfer module can send, so the app cannot pick where
 * the page moves files.
 */
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

/**
 * The launch the fake store answers for, written by the preset's `globals` at every launch. The
 * handlers have no other way to learn the backend: the fake store answers on dev only, because a fake
 * receipt must never reach the production server.
 */
export const launch: { env: ShellEnv | undefined; choice: ShellCheckoutChoice | undefined } = {
    env: undefined,
    choice: undefined,
};

/**
 * A preset that declares this shell's checkout, media and files: the given preset's globals, then
 * `CHATIC_APP_CAPABILITIES` for the choices. It also records the launch's backend and choice, which the
 * virtual store needs and the handlers cannot learn any other way.
 */
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
