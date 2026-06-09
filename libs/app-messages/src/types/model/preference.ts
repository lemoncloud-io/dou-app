// src/types/model/preference.ts

export type PreferenceKey = 'isFirstRun' | 'theme' | 'language' | 'debugSettings';

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
