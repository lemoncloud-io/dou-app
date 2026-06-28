import { create } from 'zustand';
import { isNative } from '@chatic/bridges';
import type { PreferenceKey } from '@chatic/app-messages';

import { appBridge } from '../bridge';
import { PREFERENCES } from './preferenceKeys';

// ---------------------------------------------------------------------------
// Storage model
//
// localStorage / sessionStorage is a synchronous L1 cache; the native bridge
// is the persistent store that survives a WebView cache wipe. The two layers
// are no longer either/or — a write goes to both, a read prefers the cache.
//
//   Write:  update store -> write local cache -> (if bridge) push to bridge
//   Read:   local cache -> (missing && bridge) fetch from bridge -> default
// ---------------------------------------------------------------------------

/** Raw stored string for a key, or null when nothing is cached locally yet. */
const readLocalPreference = (name: keyof typeof PREFERENCES): string | null => {
    if (typeof window === 'undefined') return null;
    const config = PREFERENCES[name];
    if (config.strategy === 'session') return sessionStorage.getItem(config.sessionKey);
    return localStorage.getItem(config.localKey);
};

/** Synchronous initial value: local cache when present, otherwise the default. */
const readPreference = (name: keyof typeof PREFERENCES): string =>
    readLocalPreference(name) ?? PREFERENCES[name].defaultValue;

/** Whether a value is already cached locally — used to decide bridge fallback reads. */
export const hasLocalPreference = (name: keyof typeof PREFERENCES): boolean => readLocalPreference(name) !== null;

/** Write a value into the local cache only (no bridge round-trip). */
const cacheLocalPreference = (name: keyof typeof PREFERENCES, value: string): void => {
    if (typeof window === 'undefined') return;
    const config = PREFERENCES[name];
    if (config.strategy === 'session') sessionStorage.setItem(config.sessionKey, value);
    else localStorage.setItem(config.localKey, value);
};

/**
 * Persist a write to every backing layer:
 *   1. local cache (synchronous source for the next read)
 *   2. native bridge — only for native+local keys when running on native, so
 *      the value survives a WebView cache wipe.
 */
const persistPreference = (name: keyof typeof PREFERENCES, value: string): void => {
    const config = PREFERENCES[name];
    cacheLocalPreference(name, value);
    if (config.strategy === 'native+local' && isNative()) {
        appBridge.savePreference({ key: config.nativeKey, value });
    }
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface PreferenceState {
    blurLastMessage: boolean;
    /** true until the user completes onboarding for the first time. */
    isFirstRun: boolean;
}

interface PreferenceActions {
    setBlurLastMessage: (value: boolean) => void;
    completeOnboarding: () => void;
    resetOnboarding: () => void;
    /**
     * Override store values from the bridge fallback read (native FetchPreference).
     * Called by PreferenceLoader only when the local cache is empty; also seeds the
     * local cache so subsequent reads are synchronous. Do not call in product code.
     */
    hydrate: (key: PreferenceKey, value: unknown) => void;
}

export const usePreferenceStore = create<PreferenceState & PreferenceActions>()(set => ({
    // Initial values read from the local cache synchronously (avoids initial flash).
    // On native, PreferenceLoader fills in any key missing from the cache from the bridge.
    blurLastMessage: readPreference('blurLastMessage') === 'true',

    // isFirstRun is the inverse of the 'completed' flag stored in localStorage.
    isFirstRun: readPreference('isFirstRun') !== 'true',

    setBlurLastMessage: (value: boolean) => {
        set({ blurLastMessage: value });
        persistPreference('blurLastMessage', value ? 'true' : 'false');
    },

    completeOnboarding: () => {
        set({ isFirstRun: false });
        persistPreference('isFirstRun', 'true');
    },

    resetOnboarding: () => {
        set({ isFirstRun: true });
        persistPreference('isFirstRun', 'false');
    },

    hydrate: (key: PreferenceKey, value: unknown) => {
        // Bridge fallback values arrive here via PreferenceLoader when the local cache was empty.
        const bool = value === true || value === 'true';
        if (key === PREFERENCES.blurLastMessage.nativeKey) {
            set({ blurLastMessage: bool });
            cacheLocalPreference('blurLastMessage', bool ? 'true' : 'false');
        } else if (key === PREFERENCES.isFirstRun.nativeKey) {
            set({ isFirstRun: bool });
            cacheLocalPreference('isFirstRun', bool ? 'true' : 'false');
        }
    },
}));
