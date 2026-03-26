import type { StateStorage } from 'zustand/middleware';
import { createJSONStorage } from 'zustand/middleware';
import { logger } from '../services';
import type { PreferenceKey } from '@chatic/app-messages';
import { cacheRepository } from '../storages';

const isPreferenceKey = (key: string): key is PreferenceKey => {
    const validKeys: PreferenceKey[] = ['isFirstRun', 'theme'];
    return (validKeys as string[]).includes(key);
};

/**
 * `Zustand`가 `cacheRepository`를 사용할 수 있도록 연결하는 커스텀 어댑터
 * `cacheRepository`는 `PreferenceKey` 타입만 허용하기 때문에 형변환을 수행함
 */
export const storageAdapter = createJSONStorage<StateStorage>(() => ({
    getItem: async (name: string): Promise<string | null> => {
        if (!isPreferenceKey(name)) {
            logger.warn('STORAGE', `Invalid key access: ${name}`);
            return null;
        }
        const value = await cacheRepository.getPreference(name as PreferenceKey);
        return value ?? null;
    },
    setItem: async (name: string, value: string): Promise<void> => {
        if (!isPreferenceKey(name)) {
            logger.warn('STORAGE', `Invalid key access: ${name}`);
            return;
        }
        await cacheRepository.savePreference(name as PreferenceKey, value);
    },
    removeItem: async (name: string): Promise<void> => {
        if (!isPreferenceKey(name)) {
            logger.warn('STORAGE', `Invalid key access: ${name}`);
            return;
        }
        await cacheRepository.removePreference(name as PreferenceKey);
    },
}));
