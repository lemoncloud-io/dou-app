import { liveShellGlobals, liveShellValue } from '@chatic/bridges';
import { runtime } from '@chatic/runtime';

export const SUPPORTED_LANGUAGES = ['ko', 'en'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export type LanguagePreference = 'system' | SupportedLanguage;

export const FALLBACK_LANGUAGE: SupportedLanguage = 'en';

const LANGUAGE_PREFERENCE_KEY = 'ui.language';

const isSupported = (value: string): value is SupportedLanguage =>
    (SUPPORTED_LANGUAGES as readonly string[]).includes(value);

export const toLanguagePreference = (value: unknown): LanguagePreference =>
    typeof value === 'string' && isSupported(value) ? value : 'system';

export interface StoredLanguageSources {
    bag?: Readonly<Record<string, unknown>>;
    storage?: Pick<Storage, 'getItem'>;
}

const decodePreference = (raw: unknown): LanguagePreference | undefined => {
    if (typeof raw !== 'string') return undefined;
    try {
        const value: unknown = JSON.parse(raw);
        return typeof value === 'string' && (value === 'system' || isSupported(value)) ? value : undefined;
    } catch {
        return undefined;
    }
};

export const readStoredLanguagePreference = ({ bag, storage }: StoredLanguageSources): LanguagePreference => {
    const fromShell = decodePreference(bag?.[LANGUAGE_PREFERENCE_KEY]);
    if (fromShell) return fromShell;
    try {
        return decodePreference(storage?.getItem(runtime.settings.storageKeyFor(LANGUAGE_PREFERENCE_KEY))) ?? 'system';
    } catch {
        return 'system';
    }
};

export const readShellConfigBag = (): Readonly<Record<string, unknown>> | undefined => {
    const bag = liveShellValue('CHATIC_APP_CONFIG_BAG');
    return bag && typeof bag === 'object' ? (bag as Record<string, unknown>) : undefined;
};

export const deviceLanguageCandidates = (): string[] => {
    if (typeof window === 'undefined') return [];
    const injected: unknown = liveShellGlobals().CHATIC_APP_CURRENT_LANGUAGE;
    const nav = typeof navigator === 'undefined' ? undefined : navigator;
    return [
        ...(typeof injected === 'string' ? [injected] : []),
        ...(nav?.languages ?? []),
        ...(nav?.language ? [nav.language] : []),
    ];
};

export const resolveLanguage = (preference: LanguagePreference, candidates: readonly string[]): SupportedLanguage => {
    if (preference !== 'system') return preference;
    for (const candidate of candidates) {
        const base = candidate.toLowerCase().split(/[-_]/)[0];
        if (isSupported(base)) return base;
    }
    return FALLBACK_LANGUAGE;
};
