import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getAppLanguage } from '../utils';
import type { PreferenceKey } from '@chatic/app-messages';
import { storageAdapter } from './storageAdapter';

export interface LanguageState {
    language: string;
    setLanguage: (language: string) => void;
}

export const useLanguageStore = create<LanguageState>()(
    persist(
        set => ({
            language: getAppLanguage(),
            setLanguage: language => set({ language }),
        }),
        {
            name: 'language' satisfies PreferenceKey,
            storage: storageAdapter,
        }
    )
);
