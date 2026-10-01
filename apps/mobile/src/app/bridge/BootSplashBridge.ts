import { NativeModules } from 'react-native';

import type { ThemeMode } from '../stores/themeMode';

const { BootSplash } = NativeModules;

/**
 * The launch splash the native side keeps on screen past the OS launch screen (Android SplashScreen
 * API held by a keep-on-screen condition, iOS a copy of the launch storyboard laid over the window).
 * Both sides lift it on their own after a safety cap, so a missing module or a failed call only ever
 * makes the splash last until that cap — never forever.
 */
export const BootSplashBridge = {
    /** Lifts the splash. Idempotent; resolves false when it was already gone or the module is missing. */
    hide: async (fade: boolean): Promise<boolean> => {
        if (!BootSplash) return false;
        try {
            return await BootSplash.hide(fade);
        } catch (error) {
            console.warn('Failed to hide the boot splash.', error);
            return false;
        }
    },

    /**
     * Records the in-app theme for the NEXT launch's splash: Android 12+ hands it to the system
     * (`setApplicationNightMode`), iOS keeps it for the overlay drawn after the OS launch screen.
     */
    setStartupTheme: async (theme: ThemeMode): Promise<boolean> => {
        if (!BootSplash) return false;
        try {
            return await BootSplash.setStartupTheme(theme);
        } catch (error) {
            console.warn('Failed to record the startup theme.', error);
            return false;
        }
    },
};
