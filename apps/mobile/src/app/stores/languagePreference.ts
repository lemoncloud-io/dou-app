/**
 * Language choice model — pure, with no storage or provider dependency, for the same reason
 * `themeMode` is kept apart: the SavePreference handler validates against it without pulling in the
 * services provider, and tests exercise the parser that ships.
 *
 * The web app is the only writer. It sends the choice itself, not a resolved language: `system`
 * means "follow the device", and only `ko`/`en` pin one.
 */

export type LanguagePreference = 'system' | 'ko' | 'en';

export const DEFAULT_LANGUAGE_PREFERENCE: LanguagePreference = 'system';

const LANGUAGE_PREFERENCES: readonly string[] = ['system', 'ko', 'en'];

export const isLanguagePreference = (value: unknown): value is LanguagePreference =>
    typeof value === 'string' && LANGUAGE_PREFERENCES.includes(value);

/**
 * The language the shell's own surfaces should use: a pinned choice as is, otherwise the device's.
 * `deviceLanguage` is passed in rather than read here so this stays pure.
 */
export const resolveAppLanguage = (preference: LanguagePreference, deviceLanguage: string): string =>
    preference === 'system' ? deviceLanguage : preference;
