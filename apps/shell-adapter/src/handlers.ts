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

mobileRoutes.pushTapPath = resolvePushTapPath;
mobileRoutes.deepLink = resolveDeepLink;

const WRITABLE_PREFERENCE_KEYS: readonly PreferenceKey[] = ['blurLastMessage', 'isFirstRun', 'pushRegistration'];
const THEMES: readonly unknown[] = ['light', 'dark', 'system'];
const LANGUAGES: readonly unknown[] = ['ko', 'en', 'system'];

export const APPLE_SIGN_IN_UNSUPPORTED =
    'Apple sign-in is not supported in the virtual shell — use Google or a phone number';

export const APP_SCHEME_OPEN_UNSUPPORTED =
    "Opening the app's own scheme is an inbound deep link — use the shell's Link tool to open one";

const isAppScheme = (url: string): boolean =>
    isCustomScheme(/^([a-z][a-z\d+\-.]*):/i.exec(url)?.[1]?.toLowerCase() ?? '');

const preferences = (shell: HandlerContext): Map<string, unknown> => {
    const found = shell.store.get('dou.preferences');
    if (found instanceof Map) return found;
    const created = new Map<string, unknown>();
    shell.store.set('dou.preferences', created);
    return created;
};

const failure = (code: string, message: string): Error => Object.assign(new Error(message), { code });

export const NO_STORE_SKUS =
    'The virtual store has no products: apps/mobile/.env.dev names no VITE_SUBSCRIPTION_IAP_* SKUs';

export const STORE_NOT_IMITATED =
    'In-app purchase is not imitated here — start the shell with DOU_SHELL_CHECKOUT=apple or google on dev to use the virtual store';

const fakePurchases = (shell: HandlerContext): FakePurchase[] => {
    const found = shell.store.get('dou.iap.purchases');
    if (Array.isArray(found)) return found as FakePurchase[];
    const created: FakePurchase[] = [];
    shell.store.set('dou.iap.purchases', created);
    return created;
};

const storeHandlers: Handlers<DouMethods> = {
    FetchProducts: (_params, shell) => {
        const store = fakeStore();
        if (!store) throw notImitated(shell, 'FetchProducts');
        const products = fakeProducts(store);
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

function notImitated(shell: HandlerContext, type: string): Error {
    shell.log.append({ source: 'unsupported', type, data: { message: STORE_NOT_IMITATED } });
    return failure('NOT_FOUND', STORE_NOT_IMITATED);
}

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
        const opened = globalThis.open?.('about:blank', '_blank');
        if (!opened) throw failure('LINK_ERROR', 'The browser blocked the new tab');
        opened.opener = null;
        opened.location.href = url;
        return {};
    },
    FetchBadgeCount: 'unsupported',
    FetchLastChatsData: () => {
        throw failure('NOT_FOUND', 'no per-channel preview in the virtual shell');
    },
};

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

const cache = new MemoryCache();

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
