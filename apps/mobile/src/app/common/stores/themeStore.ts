import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { storageAdapter } from './storageAdapter';
import type { PreferenceKey } from '@chatic/app-messages';

export type ThemeMode = 'dark' | 'light' | 'system';

interface ThemeStore {
    theme: ThemeMode;
    setTheme: (theme: ThemeMode) => void;
}

export const useThemeStore = create<ThemeStore>()(
    persist(
        set => ({
            theme: 'light',
            setTheme: theme => set({ theme }),
        }),
        {
            name: 'theme' satisfies PreferenceKey,
            storage: storageAdapter,
        }
    )
);
