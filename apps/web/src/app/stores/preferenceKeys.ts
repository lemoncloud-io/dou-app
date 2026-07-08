import type { PreferenceKey } from '@chatic/app-messages';

// ---------------------------------------------------------------------------
// Storage strategy types
// ---------------------------------------------------------------------------

/**
 * native+local: on native synced to native bridge; on web uses localStorage.
 * local:        localStorage only, bridge never involved.
 * session:      sessionStorage, tab-scoped and cleared on tab close.
 */
type NativeLocalEntry = { strategy: 'native+local'; nativeKey: PreferenceKey; localKey: string; defaultValue: string };
type LocalEntry = { strategy: 'local'; localKey: string; defaultValue: string };
type SessionEntry = { strategy: 'session'; sessionKey: string; defaultValue: string };
export type PreferenceEntry = NativeLocalEntry | LocalEntry | SessionEntry;

// ---------------------------------------------------------------------------
// Central preference registry
//
// Every app-level setting key lives here exactly once.
// `strategy` controls how reads and writes are routed:
//
//   Write flow:
//     1. Zustand store is updated (always, in-memory source of truth)
//     2. If native+local → persist to native bridge (native) or localStorage (web)
//     3. If local        → persist to localStorage
//     4. If session      → persist to sessionStorage
//
//   Read flow (initialization):
//     1. Read from localStorage / sessionStorage synchronously for initial value
//     2. If native: PreferenceLoader fetches from native and hydrates store
//     3. If neither has a value: use `defaultValue`
//
// Keys owned by external modules (language) are listed for reference
// so the full picture lives in one place.
// ---------------------------------------------------------------------------

/** Theme preference value — 'system' resolves against the OS color scheme at runtime. */
export type Theme = 'dark' | 'light' | 'system';

export const PREFERENCES = {
    // -----------------------------------------------------------------------
    // Managed by usePreferenceStore
    // -----------------------------------------------------------------------
    blurLastMessage: {
        strategy: 'native+local',
        nativeKey: 'blurLastMessage',
        localKey: 'chatic-blur-last-message',
        defaultValue: 'false',
    },
    isFirstRun: {
        strategy: 'native+local',
        nativeKey: 'isFirstRun',
        // localStorage stores 'true' when onboarding IS completed (legacy key — kept for migration compat).
        // isFirstRun is the inverse: 'true' stored here means onboarding NOT yet done.
        localKey: 'chatic-onboarding-completed',
        defaultValue: 'false',
    },
    theme: {
        strategy: 'native+local',
        nativeKey: 'theme',
        // Legacy ThemeProvider key — kept so an existing user's explicit choice survives the migration.
        localKey: 'vite-ui-theme',
        // 'system' follows the OS scheme: mobile OS inside the WebView, prefers-color-scheme on web.
        defaultValue: 'system',
    },

    // -----------------------------------------------------------------------
    // Owned by i18next / useBackHandler — registered here for reference
    // -----------------------------------------------------------------------
    language: {
        strategy: 'native+local',
        nativeKey: 'language',
        localKey: 'chatic-language',
        defaultValue: 'ko',
    },

    // -----------------------------------------------------------------------
    // Session-only: intentionally ephemeral, never sent to native bridge
    // -----------------------------------------------------------------------
    debugSettings: {
        strategy: 'session',
        sessionKey: 'chatic_debug_mode',
        defaultValue: 'false',
    },
} as const satisfies Record<string, PreferenceEntry>;

export type PreferenceName = keyof typeof PREFERENCES;
