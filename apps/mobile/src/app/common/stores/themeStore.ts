import { create } from 'zustand';

export type ThemeMode = 'dark' | 'light' | 'system';

interface ThemeStore {
    theme: ThemeMode;
    setTheme: (theme: ThemeMode) => void;
}

export const useThemeStore = create<ThemeStore>(set => ({
    theme: 'light',
    setTheme: theme => set({ theme }),
}));
