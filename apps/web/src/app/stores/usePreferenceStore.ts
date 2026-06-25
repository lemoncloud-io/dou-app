import { create } from 'zustand';
import { isNative } from '@chatic/bridges';
import type { PreferenceKey } from '@chatic/app-messages';

import { appBridge } from '../bridge';
import { PREFERENCES } from './preferenceKeys';

// ---------------------------------------------------------------------------
// Read helper
//
// Read priority:
//   1. localStorage / sessionStorage  (synchronous — avoids initial flash)
//   2. defaultValue from PREFERENCES  (native values arrive later via PreferenceLoader)
// ---------------------------------------------------------------------------

const readPreference = (name: keyof typeof PREFERENCES): string => {
    if (typeof window === 'undefined') return PREFERENCES[name].defaultValue;
    const config = PREFERENCES[name];
    if (config.strategy === 'session') {
        return sessionStorage.getItem(config.sessionKey) ?? config.defaultValue;
    }
    return localStorage.getItem(config.localKey) ?? config.defaultValue;
};

// ---------------------------------------------------------------------------
// Write helper
//
// Write flow:
//   1. Caller updates Zustand store with set() (in-memory source of truth)
//   2. This function persists to the correct backend:
//        native+local on native  → native bridge (native storage is authoritative)
//        native+local on web     → localStorage
//        local                   → localStorage
//        session                 → sessionStorage
// ---------------------------------------------------------------------------

const persistPreference = (name: keyof typeof PREFERENCES, value: string): void => {
    const config = PREFERENCES[name];
    if (config.strategy === 'native+local') {
        if (isNative()) {
            appBridge.savePreference({ key: config.nativeKey, value });
        } else {
            localStorage.setItem(config.localKey, value);
        }
    } else if (config.strategy === 'local') {
        localStorage.setItem(config.localKey, value);
    } else if (config.strategy === 'session') {
        sessionStorage.setItem(config.sessionKey, value);
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
     * Override store values from an external source (native FetchPreference response).
     * Called by PreferenceLoader on app startup; do not call in product code.
     */
    hydrate: (key: PreferenceKey, value: unknown) => void;
}

export const usePreferenceStore = create<PreferenceState & PreferenceActions>()(set => ({
    // Initial values read from localStorage synchronously.
    // On native, PreferenceLoader hydrates these with native values shortly after mount.
    blurLastMessage: readPreference('blurLastMessage') === 'true',

    // isFirstRun is the inverse of the 'completed' flag stored in localStorage.
    isFirstRun: readPreference('isFirstRun') !== 'true',

    setBlurLastMessage: (value: boolean) => {
        // 1. Write to store
        set({ blurLastMessage: value });
        // 2. Persist to backend
        persistPreference('blurLastMessage', value ? 'true' : 'false');
    },

    completeOnboarding: () => {
        // 1. Write to store
        set({ isFirstRun: false });
        // 2. Persist to backend
        persistPreference('isFirstRun', 'true');
    },

    resetOnboarding: () => {
        // 1. Write to store
        set({ isFirstRun: true });
        // 2. Persist to backend
        persistPreference('isFirstRun', 'false');
    },

    hydrate: (key: PreferenceKey, value: unknown) => {
        // Native values arrive here via PreferenceLoader after fetchPreference.
        if (key === PREFERENCES.blurLastMessage.nativeKey) {
            set({ blurLastMessage: value === true || value === 'true' });
        } else if (key === PREFERENCES.isFirstRun.nativeKey) {
            set({ isFirstRun: value === true || value === 'true' });
        }
    },
}));
