export type LanguagePreference = 'system' | 'ko' | 'en';

export const DEFAULT_LANGUAGE_PREFERENCE: LanguagePreference = 'system';

const LANGUAGE_PREFERENCES: readonly string[] = ['system', 'ko', 'en'];

export const isLanguagePreference = (value: unknown): value is LanguagePreference =>
    typeof value === 'string' && LANGUAGE_PREFERENCES.includes(value);

export const resolveAppLanguage = (preference: LanguagePreference, deviceLanguage: string): string =>
    preference === 'system' ? deviceLanguage : preference;
