import { storageKeyFor } from '@chatic/config';

/** Languages with a complete bundle under `public/locales`. */
export const SUPPORTED_LANGUAGES = ['ko', 'en'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/** What the person picked in Settings. `system` means "whatever the device is set to". */
export type LanguagePreference = 'system' | SupportedLanguage;

/** Where nothing the device reports is supported — the same language `fallbackLng` fills gaps from. */
export const FALLBACK_LANGUAGE: SupportedLanguage = 'en';

const LANGUAGE_PREFERENCE_KEY = 'ui.language';

const isSupported = (value: string): value is SupportedLanguage =>
    (SUPPORTED_LANGUAGES as readonly string[]).includes(value);

export const toLanguagePreference = (value: unknown): LanguagePreference =>
    typeof value === 'string' && isSupported(value) ? value : 'system';

export interface StoredLanguageSources {
    /** The native shell's boot envelope (`CHATIC_APP_CONFIG_BAG`) — config key → JSON-encoded value. */
    bag?: Readonly<Record<string, unknown>>;
    /** The local mirror `@chatic/config` keeps of every shell-persisted key. */
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

/**
 * The stored choice, read the way `@chatic/config` would resolve `ui.language`: the shell's boot
 * envelope first, then the local mirror.
 *
 * i18n resolves its language while its module is being imported, which is before `main.tsx` has run
 * `config.init()`, so `config.get` would answer `undefined` here — the same reason the theme has a
 * pre-paint read of its own. The shell copy wins because it is the one that survives the OS clearing
 * WebView storage; the mirror is the only copy in a plain browser. Anything unreadable is `system`.
 */
export const readStoredLanguagePreference = ({ bag, storage }: StoredLanguageSources): LanguagePreference => {
    const fromShell = decodePreference(bag?.[LANGUAGE_PREFERENCE_KEY]);
    if (fromShell) return fromShell;
    try {
        return decodePreference(storage?.getItem(storageKeyFor(LANGUAGE_PREFERENCE_KEY))) ?? 'system';
    } catch {
        return 'system';
    }
};

/** The boot envelope as the shell injected it, or nothing outside a shell. */
export const readShellConfigBag = (): Readonly<Record<string, unknown>> | undefined => {
    if (typeof window === 'undefined') return undefined;
    const bag = (window as { CHATIC_APP_CONFIG_BAG?: unknown }).CHATIC_APP_CONFIG_BAG;
    return bag && typeof bag === 'object' ? (bag as Record<string, unknown>) : undefined;
};

/**
 * The device's languages, most preferred first.
 *
 * The native shell's report comes first because inside the iOS WebView `navigator.language` is not
 * the device language: WKWebView answers with the app bundle's localization, and this bundle declares
 * only English, so a Korean phone reads `en-US` there. The shell reads the real device locale
 * (react-native-localize) and injects it as `CHATIC_APP_CURRENT_LANGUAGE` before the page loads.
 * A plain browser has no shell, and there `navigator.languages` is the device's own list.
 */
export const deviceLanguageCandidates = (): string[] => {
    if (typeof window === 'undefined') return [];
    const injected = (window as { CHATIC_APP_CURRENT_LANGUAGE?: unknown }).CHATIC_APP_CURRENT_LANGUAGE;
    const nav = typeof navigator === 'undefined' ? undefined : navigator;
    return [
        ...(typeof injected === 'string' ? [injected] : []),
        ...(nav?.languages ?? []),
        ...(nav?.language ? [nav.language] : []),
    ];
};

/**
 * The language to show: an explicit choice as is, otherwise the first device language with a bundle
 * (`ko-KR` counts as `ko`), otherwise the fallback.
 */
export const resolveLanguage = (preference: LanguagePreference, candidates: readonly string[]): SupportedLanguage => {
    if (preference !== 'system') return preference;
    for (const candidate of candidates) {
        const base = candidate.toLowerCase().split(/[-_]/)[0];
        if (isSupported(base)) return base;
    }
    return FALLBACK_LANGUAGE;
};
