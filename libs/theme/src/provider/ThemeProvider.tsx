import { createContext, useEffect, useState } from 'react';
import { isNative, webClient } from '@chatic/bridges';

export type Theme = 'dark' | 'light' | 'system';

type ThemeProviderProps = {
    children: React.ReactNode;
    defaultTheme?: Theme;
    storageKey?: string;
};

type ThemeProviderState = {
    theme: Theme;
    setTheme: (theme: Theme) => void;
};

const initialState: ThemeProviderState = {
    theme: 'system',
    setTheme: () => null,
};

const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)';

const prefersDark = () => window.matchMedia(DARK_SCHEME_QUERY).matches;

export const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

export function ThemeProvider({
    children,
    defaultTheme = 'light',
    storageKey = 'vite-ui-theme',
    ...props
}: ThemeProviderProps) {
    const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem(storageKey) as Theme) || defaultTheme);
    const [systemIsDark, setSystemIsDark] = useState(prefersDark);
    const isOnMobileApp = isNative();

    // While the choice is 'system', follow the OS as it changes, not only as it was at launch.
    // The read on subscribe catches a change made while another choice was active.
    useEffect(() => {
        if (theme !== 'system') return;

        const media = window.matchMedia(DARK_SCHEME_QUERY);
        const onChange = () => setSystemIsDark(media.matches);
        onChange();
        media.addEventListener('change', onChange);
        return () => media.removeEventListener('change', onChange);
    }, [theme]);

    const resolvedTheme = theme === 'system' ? (systemIsDark ? 'dark' : 'light') : theme;

    useEffect(() => {
        const root = window.document.documentElement;

        root.classList.remove('light', 'dark');
        root.classList.add(resolvedTheme);
    }, [resolvedTheme]);

    // Sync theme preference to native storage.
    useEffect(() => {
        if (!isOnMobileApp) return;

        webClient.post({
            type: 'SavePreference',
            data: { key: 'theme', value: theme },
        });
    }, [theme, isOnMobileApp]);

    const value = {
        theme,
        setTheme: (theme: Theme) => {
            localStorage.setItem(storageKey, theme);
            setTheme(theme);
        },
    };

    return (
        <ThemeProviderContext.Provider {...props} value={value}>
            {children}
        </ThemeProviderContext.Provider>
    );
}
