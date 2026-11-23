import { createContext, useEffect, useState } from 'react';
import { hostProfile, webClient } from '@chatic/bridges';
import { TolerantStore, WebStore } from '@chatic/storage';

import type { KeyValueStore } from '@chatic/storage';

export type Theme = 'dark' | 'light' | 'system';

type ThemeProviderProps = {
    children: React.ReactNode;
    defaultTheme?: Theme;
    storageKey?: string;
    storage?: Pick<KeyValueStore, 'get' | 'set'>;
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

let fallbackStorage: KeyValueStore | null = null;
const defaultStorage = (): KeyValueStore => (fallbackStorage ??= new TolerantStore(WebStore.local()));

export function ThemeProvider({
    children,
    defaultTheme = 'light',
    storageKey = 'vite-ui-theme',
    storage = defaultStorage(),
    ...props
}: ThemeProviderProps) {
    const [theme, setTheme] = useState<Theme>(() => (storage.get(storageKey) as Theme) || defaultTheme);
    const [systemIsDark, setSystemIsDark] = useState(prefersDark);
    const isOnMobileApp = hostProfile().bridge !== null;

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
            storage.set(storageKey, theme);
            setTheme(theme);
        },
    };

    return (
        <ThemeProviderContext.Provider {...props} value={value}>
            {children}
        </ThemeProviderContext.Provider>
    );
}
