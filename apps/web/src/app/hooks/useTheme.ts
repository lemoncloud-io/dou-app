import { useSyncExternalStore } from 'react';

import { usePreferenceStore } from '../stores/usePreferenceStore';

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
 * Web-local replacement for @chatic/theme's useTheme, API-compatible
 * ({ theme, setTheme, isDarkTheme }) so consumers only swap the import.
 *
 * Theme state lives in usePreferenceStore (no context needed), and the OS
 * scheme is subscribed reactively so 'system' consumers re-render on a live
 * OS toggle — the lib version only sampled matchMedia at render time.
 */
export const useTheme = () => {
    const theme = usePreferenceStore(state => state.theme);
    const setTheme = usePreferenceStore(state => state.setTheme);
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
