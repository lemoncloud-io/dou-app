/**
 * The value injected as `CHATIC_APP_CURRENT_LANGUAGE`.
 *
 * Mirrors mobile: `getAppLanguage()` (apps/mobile/src/app/utils/device.ts) returns the bare
 * `languageCode` from the OS locale — an ISO 639-1 subtag, NOT a `PageLanguage`. Mobile injects
 * 'ja'/'zh' where `PageLanguage` spells them 'jp'/'cn', so the practised wire contract is the
 * language subtag. Desktop must not invent the mapping mobile does not do; the two clients feed
 * the same global to the same reader.
 *
 * Electron-free so it is testable without booting an app.
 */

/** Same fallback as mobile's empty-locale branch, and as the preload's own `|| 'en'`. */
const DEFAULT_LANGUAGE = 'en';

/**
 * @param locale a BCP-47 tag such as `ko-KR` (what `app.getLocale()` returns), or an override.
 */
export const resolveAppLanguage = (locale: string | undefined): string => {
    const subtag = (locale ?? '').trim().split(/[-_]/)[0].toLowerCase();
    // Reject anything that is not a language subtag: `getLocale()` is '' before the app is ready,
    // and an override could hold junk. Injecting that would be worse than the honest default.
    return /^[a-z]{2,3}$/.test(subtag) ? subtag : DEFAULT_LANGUAGE;
};
