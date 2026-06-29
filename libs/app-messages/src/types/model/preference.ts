// src/types/model/preference.ts

// 'blurLastMessage' added: web-only preference that also needs native persistence
// so it survives webview cache clears on mobile.
export type PreferenceKey = 'isFirstRun' | 'theme' | 'language' | 'debugSettings' | 'blurLastMessage';

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
