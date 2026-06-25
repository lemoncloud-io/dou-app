import type { PreferenceKey } from '@chatic/app-messages';

/**
 * localStorage keys owned by usePreferenceStore.
 * Keys must remain stable because existing users have data under these strings.
 */
export const LOCAL_STORAGE_KEYS = {
    blurLastMessage: 'chatic-blur-last-message',
    onboarding: 'chatic-onboarding-completed',
} as const;

/**
 * Maps each store field to its PreferenceKey for the native bridge
 * (SavePreference / FetchPreference). `satisfies` keeps the narrow literal type.
 */
export const NATIVE_PREFERENCE_KEYS = {
    blurLastMessage: 'blurLastMessage',
    isFirstRun: 'isFirstRun',
    theme: 'theme',
    language: 'language',
    debugSettings: 'debugSettings',
} as const satisfies Record<string, PreferenceKey>;
