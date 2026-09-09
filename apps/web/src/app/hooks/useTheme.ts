import { useSyncExternalStore } from 'react';

import { isNative } from '@chatic/bridges';
import { config } from '@chatic/config';
import { useConfigValue } from '@chatic/config/react';
import { appBridge } from '../bridge';
import type { Theme } from '../stores/preferenceKeys';

// ---------------------------------------------------------------------------
// OS color-scheme access, isolated behind a subscribe/get pair so React can
// consume it with useSyncExternalStore. Inside the mobile WebView the media
// query reflects the mobile OS scheme; on web it reflects the browser/OS.
// ---------------------------------------------------------------------------

const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)';

/** Snapshot of the OS scheme; false during SSR where matchMedia is unavailable. */
const getSystemPrefersDark = (): boolean =>
    typeof window !== 'undefined' && window.matchMedia(DARK_SCHEME_QUERY).matches;

/** Subscribe to live OS scheme changes; returns an unsubscribe function. */
const subscribeSystemPrefersDark = (onChange: () => void): (() => void) => {
    if (typeof window === 'undefined') return () => undefined;
    const media = window.matchMedia(DARK_SCHEME_QUERY);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
};

/**
 * Pushes the theme to the native shell's OWN theme store, with confirmation and one retry.
 *
 * This is a SEPARATE channel from `config.set(..., { lane: 'shell' })` below, and both are needed:
 * `SaveConfigValue`/`ConfigKvService` is meaning-blind storage for `config.get('ui.theme')` to
 * resolve from on the NEXT boot, but the native shell's own status bar, root background and resume
 * overlay — and the pre-paint injection (`window.CHATIC_APP_THEME`) — read a DIFFERENT, older store
 * (`usePreferenceCacheHandler`'s `'theme'` case, which updates the app's own `themeStore`) that
 * `ConfigKvService` never touches. Dropping this half would leave native's own UI on the stale
 * theme forever, since nothing else ever tells it a value changed.
 *
 * Confirmed + one retry for the same reason the original `usePreferenceStore.setTheme` used it:
 * the realistic failure is a transient drop, not a rejected value, and a dropped write here is not
 * self-healing — the two layers would disagree until the next full app restart.
 */
const syncThemeToNativeStore = async (theme: Theme): Promise<void> => {
    if (!isNative()) return;
    const attempt = () => appBridge.savePreferenceConfirmed({ key: 'theme', value: theme });
    try {
        await attempt();
    } catch {
        try {
            await attempt();
        } catch {
            /* give up — the next theme change or the next cold boot re-syncs */
        }
    }
};

/**
 * `ui.theme` is `persist: 'shell'`, so the write lane has to be `shell` — writing via `local`
 * would land in a lower-precedence row than a native-hydrated shell value and be silently shadowed
 * (see `ConfigLanePolicy`'s row order). `config.set` itself confirms the bridge write, retries once,
 * and mirrors into this app's own namespaced local storage for a shell-less browser.
 *
 * The `vite-ui-theme` write is a SEPARATE mirror: this key is not private to this app — five apps'
 * pre-paint scripts and `@chatic/theme`'s `ThemeProvider` all read/write it directly so a shared
 * machine keeps one preference (see `legacyPreferenceMigration.ts`'s `syncThemeFromSharedKey` for
 * the read-back half). `@chatic/config`'s own mirror only ever touches its own namespaced key.
 */
export const setTheme = (theme: Theme): void => {
    config.set('ui.theme', theme, { lane: 'shell' });
    void syncThemeToNativeStore(theme);
    try {
        localStorage.setItem('vite-ui-theme', theme);
    } catch {
        // Best-effort — the @chatic/config write above already landed.
    }
};

/**
 * Web-local replacement for @chatic/theme's useTheme, API-compatible
 * ({ theme, setTheme, isDarkTheme }) so consumers only swap the import.
 *
 * Theme state lives in `@chatic/config` (`ui.theme`), and the OS scheme is subscribed reactively so
 * 'system' consumers re-render on a live OS toggle — the lib version only sampled matchMedia at
 * render time.
 */
export const useTheme = () => {
    const theme = useConfigValue<Theme>('ui.theme') ?? 'light';
    const systemPrefersDark = useSyncExternalStore(
        subscribeSystemPrefersDark,
        getSystemPrefersDark,
        // SSR snapshot: assume light until the client hydrates.
        () => false
    );

    return {
        theme,
        setTheme,
        isDarkTheme: theme === 'dark' || (theme === 'system' && systemPrefersDark),
    };
};
