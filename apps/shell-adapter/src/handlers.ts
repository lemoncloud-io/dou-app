import { isCustomScheme, resolveDeepLink, resolvePushTapPath } from 'shell-adapter/mobile-deeplink';
import { isOpenableUrl } from 'shell-adapter/mobile-url-trust';

import type { PreferenceKey } from '@chatic/bridge-messages';
import {
    bootHandlers,
    MemoryCache,
    ShellFailure,
    type ShellHandlerTable,
    type ShellPlatform,
} from '@chatic/fake-shell';
import type { HandlerContext, Handlers } from '@lemoncloud/hybrid-shell';

import { fakeProducts, fakePurchase, fakeStore, type FakePurchase } from './checkout';
import { mobileRoutes } from './routes';
import type { DouMethods } from './types';

// The event maps in the config call these; set here because only the page loads this module.
mobileRoutes.pushTapPath = resolvePushTapPath;
mobileRoutes.deepLink = resolveDeepLink;

/**
 * Preference keys the web may write, as the mobile app allows them (`usePreferenceCacheHandler`).
 * `theme` and `language` are validated on their own; anything else outside this list is refused, the
 * way the app refuses a key that could steer it (`debugSettings`).
 */
const WRITABLE_PREFERENCE_KEYS: readonly PreferenceKey[] = ['blurLastMessage', 'isFirstRun', 'pushRegistration'];
const THEMES: readonly unknown[] = ['light', 'dark', 'system'];
const LANGUAGES: readonly unknown[] = ['ko', 'en', 'system'];

export const APPLE_SIGN_IN_UNSUPPORTED =
    'Apple sign-in is not supported in the virtual shell — use Google or a phone number';

export const APP_SCHEME_OPEN_UNSUPPORTED =
    "Opening the app's own scheme is an inbound deep link — use the shell's Link tool to open one";

/** Whether `url` is in the app's own scheme, which the app treats as a link into itself, not a page. */
const isAppScheme = (url: string): boolean =>
    isCustomScheme(/^([a-z][a-z\d+\-.]*):/i.exec(url)?.[1]?.toLowerCase() ?? '');

/** The older preference store (`FetchPreference` and friends), kept across relaunches as the app keeps it. */
const preferences = (shell: HandlerContext): Map<string, unknown> => {
    const found = shell.store.get('dou.preferences');
    if (found instanceof Map) return found;
    const created = new Map<string, unknown>();
    shell.store.set('dou.preferences', created);
    return created;
};

/** A failed reply with the app's error code, as the mobile handlers answer a domain failure. */
const failure = (code: string, message: string): Error => Object.assign(new Error(message), { code });

export const NO_STORE_SKUS =
    'The virtual store has no products: apps/mobile/.env.dev names no VITE_SUBSCRIPTION_IAP_* SKUs';

export const STORE_NOT_IMITATED =
    'In-app purchase is not imitated here — start the shell with DOU_SHELL_CHECKOUT=apple or google on dev to use the virtual store';

/** The purchases the virtual store has made since the shell page loaded, for a restore to find. */
const fakePurchases = (shell: HandlerContext): FakePurchase[] => {
    const found = shell.store.get('dou.iap.purchases');
    if (Array.isArray(found)) return found as FakePurchase[];
    const created: FakePurchase[] = [];
    shell.store.set('dou.iap.purchases', created);
    return created;
};

/**
 * The store, when this launch sells through the virtual one (`checkout.ts`): a catalog with an
 * obviously fake price, a purchase that succeeds at once with a fake receipt, and the rest of the
 * store's calls. The receipt goes to the dev server for validation like any other and is refused
 * there, so the store path can be followed to that refusal — never further, and never on prod.
 *
 * Without the virtual store the same calls are refused at once as unsupported, rather than left to the
 * panel: a purchase sheet that is not there reads as one, and the web waits a minute for it.
 */
const storeHandlers: Handlers<DouMethods> = {
    FetchProducts: (_params, shell) => {
        const store = fakeStore();
        if (!store) throw notImitated(shell, 'FetchProducts');
        const products = fakeProducts(store);
        // Without the mobile app's dev SKUs the plan cards show no price; say why, once per call.
        if (!products.length) {
            shell.log.append({ source: 'unsupported', type: 'FetchProducts', data: { message: NO_STORE_SKUS } });
        }
        return { products };
    },
    Purchase: ({ id }, shell) => {
        const store = fakeStore();
        if (!store) {
            shell.notify('OnPurchaseError', { error: { code: 'iap-not-available', message: STORE_NOT_IMITATED } });
            throw notImitated(shell, 'Purchase');
        }
        const purchase = fakePurchase(store, id);
        fakePurchases(shell).push(purchase);
        // After the reply, as a store's sheet answers after the request went out.
        setTimeout(() => shell.notify('OnPurchaseSuccess', { purchase }), 0);
        return {};
    },
    FinishPurchaseTransaction: ({ purchase }, shell) => {
        if (!fakeStore()) throw notImitated(shell, 'FinishPurchaseTransaction');
        const held = fakePurchases(shell);
        const at = held.findIndex(p => p.purchaseToken === purchase.purchaseToken);
        if (at !== -1) held.splice(at, 1);
        return { purchase };
    },
    FetchCurrentPurchases: (_params, shell) => {
        if (!fakeStore()) throw notImitated(shell, 'FetchCurrentPurchases');
        return { purchases: fakePurchases(shell) };
    },
    OpenSubscriptionManagement: (_params, shell) => {
        throw notImitated(shell, 'OpenSubscriptionManagement');
    },
};

/** Logs a store call the shell does not answer, and the refusal the web reads as an app without it. */
function notImitated(shell: HandlerContext, type: string): Error {
    shell.log.append({ source: 'unsupported', type, data: { message: STORE_NOT_IMITATED } });
    return failure('NOT_FOUND', STORE_NOT_IMITATED);
}

/** The settings the app stores, and sign-in. */
const shellHandlers: Handlers<DouMethods> = {
    FetchPreference: ({ key }, shell) => ({ key, value: preferences(shell).get(key) ?? null }),
    SavePreference: ({ key, value }, shell) => {
        if (key === 'theme' && !THEMES.includes(value)) {
            throw failure('PREF_INVALID_VALUE', `Invalid theme value: ${String(value)}`);
        }
        if (key === 'language' && !LANGUAGES.includes(value)) {
            throw failure('PREF_INVALID_VALUE', `Invalid language value: ${String(value)}`);
        }
        if (key !== 'theme' && key !== 'language' && !WRITABLE_PREFERENCE_KEYS.includes(key)) {
            throw failure('PREF_KEY_NOT_WRITABLE', `Preference key not writable from web: ${key}`);
        }
        preferences(shell).set(key, value);
        return { key, success: true };
    },
    DeletePreference: ({ key }, shell) => {
        preferences(shell).delete(key);
        return { key, success: true };
    },
    OAuthLogin: async ({ provider }, shell) => {
        if (provider === 'apple') {
            // The shape the app fails a sign-in with (`useOAuthHandler`), so the web shows its failure
            // toast. `NOT_FOUND` would never reach the sign-in listener and leave the button waiting.
            shell.log.append({
                source: 'unsupported',
                type: 'OAuthLogin',
                data: { message: APPLE_SIGN_IN_UNSUPPORTED },
            });
            throw failure('OAUTH_LOGIN_ERROR', APPLE_SIGN_IN_UNSUPPORTED);
        }
        const credential = await shell.auth.signIn();
        return { result: credential };
    },
    OAuthLogout: () => ({ success: true }),
    // The app hands the URL to the OS (`Linking.openURL`); the shell's OS is this browser, so a new tab.
    // The app's own refusal comes first and in its words, so a link the device would not open does
    // not open here either.
    OpenURL: ({ url }, shell) => {
        if (!isOpenableUrl(url)) {
            throw failure('LINK_NOT_ALLOWED', 'This link cannot be opened.');
        }
        if (isAppScheme(url)) {
            shell.log.append({
                source: 'unsupported',
                type: 'OpenURL',
                data: { message: APP_SCHEME_OPEN_UNSUPPORTED },
            });
            throw failure('LINK_ERROR', APP_SCHEME_OPEN_UNSUPPORTED);
        }
        // A blank tab first, then the address. With `noopener` in the features `open` returns null
        // whether or not a tab opened, so a blocked popup could not be told apart; and the opener can
        // only be cut while the tab is still same-origin, before it navigates.
        const opened = globalThis.open?.('about:blank', '_blank');
        if (!opened) throw failure('LINK_ERROR', 'The browser blocked the new tab');
        opened.opener = null;
        opened.location.href = url;
        return {};
    },
    // The shell draws the badge the app sets, but keeps no count to read back.
    FetchBadgeCount: 'unsupported',
    // The memory cache keeps no per-channel preview; `NOT_FOUND` sends the web to a window per channel,
    // as an older app does (`MemoryCache`). Without it the home list waits on the panel's card.
    FetchLastChatsData: () => {
        throw failure('NOT_FOUND', 'no per-channel preview in the virtual shell');
    },
};

/**
 * A table of `@chatic/fake-shell` handlers as the shell's handlers: the same answers the end-to-end
 * suite gives, with a `ShellFailure` thrown as an error carrying its code, which the shell sends back
 * as the reply's error code. `platform` builds the table per call, for answers that name the platform.
 */
const fromTable = (table: (platform: ShellPlatform) => ShellHandlerTable): Handlers<DouMethods> =>
    Object.fromEntries(
        Object.keys(table('ios')).map(type => [
            type,
            async (params: unknown, shell: HandlerContext) => {
                const handler = table(shell.device.platform)[type as keyof ShellHandlerTable] as
                    | ((data: unknown, message: unknown) => unknown)
                    | undefined;
                const result = await handler?.(params, { type, data: params });
                if (result instanceof ShellFailure) throw failure(result.code, result.message);
                return result;
            },
        ])
    );

// One cache for the page's life: kept across relaunches, as the app's SQLite is.
const cache = new MemoryCache();

/** The boot answers, less the badge: the shell's own `badge.set` records it and draws it beside the phone. */
const bootAnswers = (platform: ShellPlatform): ShellHandlerTable => {
    const { SetBadgeCount: _drawnByTheShell, ...rest } = bootHandlers(platform);
    return rest;
};

export default {
    ...fromTable(bootAnswers),
    ...fromTable(() => cache.handlers()),
    ...shellHandlers,
    ...storeHandlers,
} satisfies Handlers<DouMethods>;
