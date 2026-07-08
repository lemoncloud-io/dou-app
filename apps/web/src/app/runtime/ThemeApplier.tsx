import { useEffect } from 'react';

import { useTheme } from '../hooks/useTheme';

/**
 * Applies the resolved theme as a 'light'/'dark' class on <html>. Renders
 * nothing — mounted once in App, outside AppRuntime, so the theme is right
 * even before the session is ready.
 *
 * Replaces @chatic/theme's ThemeProvider for apps/web. Persistence and native
 * bridge sync are handled by usePreferenceStore.setTheme, so this component
 * only owns the DOM side effect. isDarkTheme already tracks live OS scheme
 * changes, which the lib provider never did.
 */
export const ThemeApplier = (): null => {
    const { isDarkTheme } = useTheme();

    useEffect(() => {
        const root = window.document.documentElement;
        root.classList.remove('light', 'dark');
        root.classList.add(isDarkTheme ? 'dark' : 'light');
    }, [isDarkTheme]);

    return null;
};
