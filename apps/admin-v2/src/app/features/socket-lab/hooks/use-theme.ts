import { useCallback, useEffect, useState } from 'react';

export type Theme = 'dark' | 'light';

const KEY = 'sm-theme';

const read = (): Theme => {
    try {
        return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark';
    } catch {
        return 'dark';
    }
};

export function useTheme() {
    const [theme, setTheme] = useState<Theme>(read);
    useEffect(() => {
        try {
            localStorage.setItem(KEY, theme);
        } catch {
            /* empty */
        }
    }, [theme]);
    const toggle = useCallback(() => setTheme(t => (t === 'dark' ? 'light' : 'dark')), []);
    return { theme, toggle };
}
