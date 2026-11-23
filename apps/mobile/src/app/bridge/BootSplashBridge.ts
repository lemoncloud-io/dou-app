import { NativeModules } from 'react-native';

import type { ThemeMode } from '../stores/themeMode';

const { BootSplash } = NativeModules;

export const BootSplashBridge = {
    hide: async (fade: boolean): Promise<boolean> => {
        if (!BootSplash) return false;
        try {
            return await BootSplash.hide(fade);
        } catch (error) {
            console.warn('Failed to hide the boot splash.', error);
            return false;
        }
    },

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
