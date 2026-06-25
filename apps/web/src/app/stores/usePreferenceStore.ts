import { create } from 'zustand';
import { isNative } from '@chatic/bridges';
import type { PreferenceKey } from '@chatic/app-messages';

import { appBridge } from '../bridge';
import { LOCAL_STORAGE_KEYS, NATIVE_PREFERENCE_KEYS } from './preferenceKeys';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Write a preference value to the correct backing store.
 *
 * On native the value is persisted in the native key-value store so it
 * survives webview cache clears. On web it goes to localStorage.
 * The two paths are mutually exclusive: native does NOT write localStorage
 * because native storage is the source of truth there.
 */
const persistPreference = (nativeKey: PreferenceKey, localKey: string, value: string): void => {
    if (isNative()) {
        appBridge.savePreference({ key: nativeKey, value });
    } else {
        localStorage.setItem(localKey, value);
    }
};

const readLocalStorage = (key: string, fallback: string): string => {
    if (typeof window === 'undefined') return fallback;
    return localStorage.getItem(key) ?? fallback;
};

// ---------------------------------------------------------------------------
// Initial values — read from localStorage synchronously so there is no flash.
// On native these are overridden once PreferenceLoader hydrates from native.
// ---------------------------------------------------------------------------

const getInitialBlurLastMessage = (): boolean =>
    readLocalStorage(LOCAL_STORAGE_KEYS.blurLastMessage, 'false') === 'true';

// isFirstRun = true when onboarding has NOT been completed yet.
// The localStorage key stores 'true' when onboarding IS completed, so we invert.
const getInitialIsFirstRun = (): boolean => readLocalStorage(LOCAL_STORAGE_KEYS.onboarding, 'false') !== 'true';

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
     * Overwrite a preference from an external source (native FetchPreference response).
     * Called by PreferenceLoader; should not be called directly in product code.
     */
    hydrate: (key: PreferenceKey, value: unknown) => void;
}

export const usePreferenceStore = create<PreferenceState & PreferenceActions>()(set => ({
    blurLastMessage: getInitialBlurLastMessage(),
    isFirstRun: getInitialIsFirstRun(),

    setBlurLastMessage: (value: boolean) => {
        persistPreference(
            NATIVE_PREFERENCE_KEYS.blurLastMessage,
            LOCAL_STORAGE_KEYS.blurLastMessage,
            value ? 'true' : 'false'
        );
        set({ blurLastMessage: value });
    },

    completeOnboarding: () => {
        // Native stores isFirstRun=false to indicate onboarding is done.
        // localStorage stores 'true' under the 'completed' key (legacy key kept for migration compat).
        persistPreference(NATIVE_PREFERENCE_KEYS.isFirstRun, LOCAL_STORAGE_KEYS.onboarding, 'true');
        set({ isFirstRun: false });
    },

    resetOnboarding: () => {
        persistPreference(NATIVE_PREFERENCE_KEYS.isFirstRun, LOCAL_STORAGE_KEYS.onboarding, 'false');
        set({ isFirstRun: true });
    },

    hydrate: (key: PreferenceKey, value: unknown) => {
        if (key === NATIVE_PREFERENCE_KEYS.blurLastMessage) {
            set({ blurLastMessage: value === true || value === 'true' });
        } else if (key === NATIVE_PREFERENCE_KEYS.isFirstRun) {
            // Native stores the raw isFirstRun boolean.
            set({ isFirstRun: value === true || value === 'true' });
        }
    },
}));
