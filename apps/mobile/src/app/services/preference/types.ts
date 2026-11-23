import type { PreferenceKey } from '@chatic/bridge-messages';

export interface IPreferenceService {
    get<T = any>(key: PreferenceKey): Promise<T | null>;

    set<T = any>(key: PreferenceKey, value: T): Promise<void>;

    getSync<T = any>(key: PreferenceKey): T | null;

    setSync<T = any>(key: PreferenceKey, value: T): void;

    remove(key: PreferenceKey): Promise<void>;

    clearAll(): void;
}
