// src/types/model/preference.ts

export type PreferenceKey = 'isFirstRun' | 'theme' | 'language';

export interface FetchPreferencePayload {
    key: PreferenceKey;
}

export interface SavePreferencePayload {
    key: PreferenceKey;
    value: any;
}

export interface DeletePreferencePayload {
    key: PreferenceKey;
}

export interface OnFetchPreferencePayload {
    key: PreferenceKey;
    value: any;
}

export interface OnSavePreferencePayload {
    key: PreferenceKey;
    success: boolean;
}

export interface OnDeletePreferencePayload {
    key: PreferenceKey;
    success: boolean;
}
