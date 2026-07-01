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

/** Socket Monitor 테마 상태 — localStorage 영속. light면 .sm-root에 sm-light 클래스 부여. */
export function useTheme() {
    const [theme, setTheme] = useState<Theme>(read);
    useEffect(() => {
        try {
            localStorage.setItem(KEY, theme);
        } catch {
            /* storage 접근 불가 시 무시(세션 내 상태만 유지) */
        }
    }, [theme]);
    const toggle = useCallback(() => setTheme(t => (t === 'dark' ? 'light' : 'dark')), []);
    return { theme, toggle };
}
