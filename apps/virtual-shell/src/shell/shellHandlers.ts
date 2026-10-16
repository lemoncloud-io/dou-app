import { ShellFailure, type ShellHandlerTable, type ShellPlatform } from '@chatic/fake-shell';
import type { AppBackgroundStatus, OAuthTokenResult, PreferenceKey } from '@chatic/app-messages';

/**
 * Preference keys the web may write, as the mobile app allows them (`usePreferenceCacheHandler`).
 * `theme` and `language` are validated on their own; anything else outside this list is refused, the
 * way the app refuses a key that could steer it (`debugSettings`).
 */
const WRITABLE_PREFERENCE_KEYS: readonly PreferenceKey[] = ['blurLastMessage', 'isFirstRun', 'pushRegistration'];
const THEMES = ['light', 'dark', 'system'] as const;
const LANGUAGES = ['ko', 'en', 'system'] as const;

export type ThemeMode = (typeof THEMES)[number];

/** What the shell keeps across relaunches, as the app keeps it in its own storage. */
export interface ShellStorage {
    /** `@chatic/config`'s shell lane: re-injected as `CHATIC_APP_CONFIG_BAG` at every boot. */
    configBag: Record<string, string>;
    /** The older preference store (`FetchPreference` and friends). */
    preferences: Map<string, unknown>;
}

/** Sign-in, which needs a person: the Google sheet answers, Apple is refused. */
export interface SignInDriver {
    /** Resolves with the token result, or `null` when the person cancels. */
    signInWithGoogle(): Promise<OAuthTokenResult | null>;
    signOut(): void;
    /** Answers a sign-in still waiting as cancelled; nothing when none is. */
    cancel(): void;
}

export interface ShellHandlerDeps {
    storage: ShellStorage;
    platform: () => ShellPlatform;
    appState: () => AppBackgroundStatus;
    signIn: SignInDriver;
    /** Records that a request was answered as unsupported, beyond `NOT_FOUND`. */
    unsupported: (type: string, message: string) => void;
}

export const APPLE_SIGN_IN_UNSUPPORTED =
    'Apple sign-in is not supported in the virtual shell — use Google or a phone number';

/**
 * What the virtual shell answers beyond the shared boot answers and cache: the settings the app
 * stores, the app state, and sign-in.
 */
export const shellHandlers = (deps: ShellHandlerDeps): ShellHandlerTable => ({
    SaveConfigValue: ({ key, value }) => {
        deps.storage.configBag[key] = value;
        return { key, success: true };
    },
    ClearConfigValue: ({ key }) => {
        delete deps.storage.configBag[key];
        return { key, success: true };
    },
    FetchPreference: ({ key }) => ({ key, value: deps.storage.preferences.get(key) ?? null }),
    SavePreference: ({ key, value }) => {
        if (key === 'theme' && !THEMES.includes(value)) {
            return new ShellFailure('PREF_INVALID_VALUE', `Invalid theme value: ${String(value)}`);
        }
        if (key === 'language' && !LANGUAGES.includes(value)) {
            return new ShellFailure('PREF_INVALID_VALUE', `Invalid language value: ${String(value)}`);
        }
        if (key !== 'theme' && key !== 'language' && !WRITABLE_PREFERENCE_KEYS.includes(key)) {
            return new ShellFailure('PREF_KEY_NOT_WRITABLE', `Preference key not writable from web: ${key}`);
        }
        deps.storage.preferences.set(key, value);
        return { key, success: true };
    },
    DeletePreference: ({ key }) => {
        deps.storage.preferences.delete(key);
        return { key, success: true };
    },
    FetchBackgroundStatus: () => {
        const status = deps.appState();
        return { status, isForeground: status === 'active', isBackground: status === 'background' };
    },
    OAuthLogin: async ({ provider }) => {
        if (provider === 'apple') {
            // The shape the app fails a sign-in with (`useOAuthHandler`), so the web shows its failure
            // toast. `NOT_FOUND` would never reach the sign-in listener and leave the button waiting.
            deps.unsupported('OAuthLogin', APPLE_SIGN_IN_UNSUPPORTED);
            return new ShellFailure('OAUTH_LOGIN_ERROR', APPLE_SIGN_IN_UNSUPPORTED);
        }
        return { result: await deps.signIn.signInWithGoogle() };
    },
    OAuthLogout: () => {
        deps.signIn.signOut();
        return { success: true };
    },
});

/** The theme the shell injects at boot: what the web last saved, else the device's. */
export const storedTheme = (storage: ShellStorage): ThemeMode | undefined => {
    const theme = storage.preferences.get('theme');
    return THEMES.includes(theme as ThemeMode) ? (theme as ThemeMode) : undefined;
};
