import { useEffect } from 'react';

import { useTheme } from '../hooks/useTheme';

const DARK_BG = '#121212';
const LIGHT_BG = '#ffffff';

export const ThemeApplier = (): null => {
    const { isDarkTheme } = useTheme();

    useEffect(() => {
        const root = window.document.documentElement;
        root.classList.remove('light', 'dark');
        root.classList.add(isDarkTheme ? 'dark' : 'light');

        const themeColorMeta = window.document.querySelector('meta[name="theme-color"]');
        themeColorMeta?.setAttribute('content', isDarkTheme ? DARK_BG : LIGHT_BG);
    }, [isDarkTheme]);

    return null;
};
