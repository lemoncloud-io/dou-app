import { useEffect } from 'react';

import { useTheme } from '../hooks/useTheme';

/**
 * Background colors for the mobile status/URL bar tint (`theme-color`).
 *
 * The same pair is hand-maintained in several places that cannot import it — index.html's
 * pre-paint script and its anti-flash <style> block, apps/desktop-web/index.html, and
 * apps/mobile's getThemeBackgroundColor. Changing the palette means changing all of them.
 */
const DARK_BG = '#121212';
const LIGHT_BG = '#ffffff';

/**
 * Applies the resolved theme as a 'light'/'dark' class on <html>. Renders
 * nothing — mounted once in App, outside AppRuntime, so the theme is right
 * even before the session is ready.
 *
 * Replaces @chatic/theme's ThemeProvider for apps/web. Persistence and native
 * bridge sync are handled by usePreferenceStore.setTheme, so this component
 * only owns the DOM side effect. isDarkTheme already tracks live OS scheme
 * changes, which the lib provider never did.
 *
 * `theme-color` is set here too, not only by the pre-paint script: that script runs once at
 * boot, so without this an in-app theme change left the mobile system UI tint stale until the
 * next reload. `--splash-bg` is deliberately NOT set here — its only consumer is the #splash
 * placeholder inside #root, which React has already replaced by the time this first runs.
 */
export const ThemeApplier = (): null => {
    const { isDarkTheme } = useTheme();

    useEffect(() => {
        const root = window.document.documentElement;
        root.classList.remove('light', 'dark');
        root.classList.add(isDarkTheme ? 'dark' : 'light');

        // Targeted by name, not by the id index.html happens to carry, so dropping that id
        // cannot silently disable theme-color sync.
        const themeColorMeta = window.document.querySelector('meta[name="theme-color"]');
        themeColorMeta?.setAttribute('content', isDarkTheme ? DARK_BG : LIGHT_BG);
    }, [isDarkTheme]);

    return null;
};
