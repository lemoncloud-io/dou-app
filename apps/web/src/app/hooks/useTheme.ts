import { useSyncExternalStore } from 'react';

import { runtime } from '@chatic/runtime-react';
import { deviceStore } from '../storage';
import type { Theme } from '../stores/preferenceKeys';

const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)';

const getSystemPrefersDark = (): boolean =>
    typeof window !== 'undefined' && window.matchMedia(DARK_SCHEME_QUERY).matches;

const subscribeSystemPrefersDark = (onChange: () => void): (() => void) => {
    if (typeof window === 'undefined') return () => undefined;
    const media = window.matchMedia(DARK_SCHEME_QUERY);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
};

const syncThemeToNativeStore = async (theme: Theme): Promise<void> => {
    const store = runtime.appShell.preferences;
    if (!store) return;
    const attempt = () => store.save('theme', theme);
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

export const setTheme = (theme: Theme): void => {
    runtime.settings.set('ui.theme', theme, { lane: 'shell' });
    void syncThemeToNativeStore(theme);
    deviceStore.set('vite-ui-theme', theme);
};

export const useTheme = () => {
    const theme = runtime.settings.useConfigValue<Theme>('ui.theme') ?? 'light';
    const systemPrefersDark = useSyncExternalStore(subscribeSystemPrefersDark, getSystemPrefersDark, () => false);

    return {
        theme,
        setTheme,
        isDarkTheme: theme === 'dark' || (theme === 'system' && systemPrefersDark),
    };
};
