import { preferenceStore } from './preferenceStore';

export const cachePreferenceService = {
    getPreference: (key: string) => preferenceStore.get(key as any),
    savePreference: (key: string, value: any) => preferenceStore.set(key as any, value),
    removePreference: (key: string) => preferenceStore.remove(key as any),
};
