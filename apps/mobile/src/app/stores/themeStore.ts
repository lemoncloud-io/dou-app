import { create } from 'zustand';
import { readThemeMode, writeThemeMode } from './themeStorage';
import type { ThemeMode } from './themeMode';

interface ThemeStore {
    theme: ThemeMode;
    setTheme: (theme: ThemeMode) => void;
}

/**
 * Theme mode owned by the native shell. The web app is the only writer (it pushes
 * changes over SavePreference); this store persists, applies, and restores.
 *
 * Unlike its sibling stores this one does NOT use zustand's `persist` middleware.
 * `persist` rehydrates asynchronously through storageAdapter -> preferenceService,
 * so the first frames would render against the initial value instead of the stored
 * one — visible as a wrong-colored status bar and a background flash right after the
 * splash. The theme is a first-paint value, so it is read synchronously here instead.
 * Language has no such constraint and keeps using `persist`.
 */
export const useThemeStore = create<ThemeStore>()(set => ({
    theme: readThemeMode(),
    setTheme: theme => {
        set({ theme });
        writeThemeMode(theme);
    },
}));
