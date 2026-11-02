// src/types/model/preference.ts

// 'blurLastMessage' added: web-only preference that also needs native persistence
// so it survives webview cache clears on mobile.
// 'pushRegistration' is not a user setting — it is app-runtime's "this device already registered its
// push token" record (ADR-0077), mirrored natively for the same reason: a webview cache clear would
// otherwise drop it and re-trigger a registration. Owned by libs/app-runtime, not the preference
// store. Writing it requires the mobile allowlist (usePreferenceCacheHandler.ts), so a web build
// running inside an app that predates that entry is refused and falls back to localStorage.
export type PreferenceKey =
    | 'isFirstRun'
    | 'theme'
    | 'language'
    | 'debugSettings'
    | 'blurLastMessage'
    | 'pushRegistration';

export type FetchPreferencePayload = {
    key: PreferenceKey;
};

export type SavePreferencePayload = {
    key: PreferenceKey;
    value: any;
};

export type DeletePreferencePayload = {
    key: PreferenceKey;
};

export type OnFetchPreferencePayload = {
    key: PreferenceKey;
    value: any;
};

export type OnSavePreferencePayload = {
    key: PreferenceKey;
    success: boolean;
};

export type OnDeletePreferencePayload = {
    key: PreferenceKey;
    success: boolean;
};
