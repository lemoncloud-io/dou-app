import type { StateStorage } from 'zustand/middleware';
import { createJSONStorage } from 'zustand/middleware';
import { provider } from '../services';
import type { PreferenceKey } from '@chatic/app-messages';

const isPreferenceKey = (key: string): key is PreferenceKey => {
    const validKeys = ['isFirstRun', 'theme', 'language', 'debugSettings'];
    return (validKeys as string[]).includes(key);
};

/**
 * A custom adapter that connects `Zustand` so it can use `preferenceService`.
 * Performs type casting since `preferenceService` only accepts the `PreferenceKey` type.
 */
export const storageAdapter = createJSONStorage<StateStorage>(() => ({
    getItem: async (name: string): Promise<string | null> => {
        if (!isPreferenceKey(name)) {
            provider.logService.warn('STORAGE', `Invalid key access: ${name}`);
            return null;
        }
        const value = await provider.preferenceService.get(name as PreferenceKey);
        return value ?? null;
    },
    setItem: async (name: string, value: string): Promise<void> => {
        if (!isPreferenceKey(name)) {
            provider.logService.warn('STORAGE', `Invalid key access: ${name}`);
            return;
        }
        await provider.preferenceService.set(name as PreferenceKey, value);
    },
    removeItem: async (name: string): Promise<void> => {
        if (!isPreferenceKey(name)) {
            provider.logService.warn('STORAGE', `Invalid key access: ${name}`);
            return;
        }
        await provider.preferenceService.remove(name as PreferenceKey);
    },
}));
