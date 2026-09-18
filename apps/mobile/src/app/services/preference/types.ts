import type { PreferenceKey } from '@chatic/app-messages';

export interface IPreferenceService {
    /**
     * Fetches a preference value
     */
    get<T = any>(key: PreferenceKey): Promise<T | null>;

    /**
     * Saves a preference value
     */
    set<T = any>(key: PreferenceKey, value: T): Promise<void>;

    /**
     * Synchronously fetches a preference value — used only for values needed before first paint (theme).
     * An async restore arrives after the first frame and shows up as a screen flash.
     */
    getSync<T = any>(key: PreferenceKey): T | null;

    /**
     * Synchronously saves a preference value (pairs with `getSync`)
     */
    setSync<T = any>(key: PreferenceKey, value: T): void;

    /**
     * Removes a preference value
     */
    remove(key: PreferenceKey): Promise<void>;

    /**
     * Resets all preference values
     */
    clearAll(): void;
}
