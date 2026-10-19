import { resolveDeepLink, resolvePushTapPath } from 'shell-adapter/mobile-deeplink';

import type { PreferenceKey } from '@chatic/app-messages';
import {
    bootHandlers,
    MemoryCache,
    ShellFailure,
    type ShellHandlerTable,
    type ShellPlatform,
} from '@chatic/fake-shell';
import type { HandlerContext, Handlers } from '@lemoncloud/hybrid-shell';

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

/** The settings the app stores, the app state, and sign-in. */
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
    FetchBackgroundStatus: (_params, shell) => {
        const status = shell.app.state();
        return { status, isForeground: status === 'active', isBackground: status === 'background' };
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
} satisfies Handlers<DouMethods>;
