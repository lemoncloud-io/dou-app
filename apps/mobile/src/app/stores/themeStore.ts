import { create } from 'zustand';
import { readThemeMode, writeThemeMode } from './themeStorage';
import type { ThemeMode } from './themeMode';

interface ThemeStore {
    theme: ThemeMode;
    setTheme: (theme: ThemeMode) => void;
}

export const useThemeStore = create<ThemeStore>()(set => ({
    theme: readThemeMode(),
    setTheme: theme => {
        set({ theme });
        writeThemeMode(theme);
    },
}));
