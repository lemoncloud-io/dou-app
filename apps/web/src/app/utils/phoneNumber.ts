import {
    getCountries,
    getCountryCallingCode,
    isSupportedCountry,
    isValidPhoneNumber,
    parsePhoneNumberFromString,
} from 'libphonenumber-js/mobile';
// Type-only, so it is erased at build and pulls no metadata of its own. This is the LIBRARY's
// country union, not `@lemoncloud/chatic-backend-api`'s — the app never binds its own types to the
// backend package (relay-server-invite 02-design.md D4), which is why `PhoneCountry` below is a
// plain string and the final verdict on a value is the server's 400.
import type { CountryCode } from 'libphonenumber-js';

/**
 * ISO alpha-2 country of a phone number, as `libphonenumber-js` and the server both spell it.
 *
 * Deliberately `string` rather than a union: the backend's `CountryCode` LUT stays out of the app
 * (ADR-0044 §1), and the library's own union would drift against it just as silently.
 */
export type PhoneCountry = string;

/** One row of the country picker. */
export interface PhoneCountryOption {
    code: PhoneCountry;
    /** Localized region name, or the ISO code itself where `Intl.DisplayNames` is missing. */
    name: string;
    /** Dial code with its `+` (e.g. `+82`), matching what the picker shows. */
    dialCode: string;
}

/** Where the last explicit pick is remembered. Per-device by design — no server slot exists. */
const COUNTRY_STORAGE_KEY = 'dou.phoneInput.country.v1';

const digitsOf = (value: string): string => value.replace(/\D/g, '');

/**
 * Localized region names, degrading to the ISO code.
 *
 * `Intl.DisplayNames` exists in every modern browser and WebView, but the fallback is real rather
 * than defensive noise: the picker rows also carry the flag and dial code, so ISO codes alone still
 * identify a country (ADR-0044 결과).
 */
const createRegionNamer = (lang: string): ((code: string) => string) => {
    let names: Intl.DisplayNames;
    try {
        names = new Intl.DisplayNames([lang], { type: 'region' });
    } catch {
        return code => code;
    }
    return code => {
        try {
            return names.of(code) ?? code;
        } catch {
            return code;
        }
    };
};

const listCache = new Map<string, PhoneCountryOption[]>();

/**
 * Every country the mobile metadata knows (245), localized and sorted for `lang`.
 *
 * Memoized per language: the list is stable for a session, and building it walks the whole metadata
 * plus one `Intl.Collator` pass — too much to redo on each keystroke of the picker's search.
 */
export const listPhoneCountries = (lang: string): PhoneCountryOption[] => {
    const cached = listCache.get(lang);
    if (cached) return cached;

    const nameOf = createRegionNamer(lang);
    let collator: Intl.Collator;
    try {
        collator = new Intl.Collator(lang);
    } catch {
        collator = new Intl.Collator();
    }

    const list = getCountries()
        .map(code => ({ code, name: nameOf(code), dialCode: `+${getCountryCallingCode(code)}` }))
        .sort((a, b) => collator.compare(a.name, b.name));

    listCache.set(lang, list);
    return list;
};

/** Dial code of one country (`+82`), for the picker trigger. `null` for anything unsupported. */
export const phoneCountryDialCode = (country: PhoneCountry): string | null => {
    try {
        return isSupportedCountry(country) ? `+${getCountryCallingCode(country as CountryCode)}` : null;
    } catch {
        return null;
    }
};

/**
 * Is this a plausible MOBILE number for that country?
 *
 * Mobile-only on purpose: the flow delivers a code by SMS, so letting a landline through would be a
 * regression against the Korean-only rules this replaces (which accepted mobile prefixes alone).
 * That is also why the import above is `libphonenumber-js/mobile` and not `/min`, which calls a
 * Korean landline valid.
 *
 * A missing country is "not yet answerable", not "invalid" — the caller disables its CTA rather
 * than reddening the field.
 */
export const isValidMobileNumber = (input: string, country: PhoneCountry | null): boolean => {
    if (!country) return false;
    try {
        return isValidPhoneNumber(input, country as CountryCode);
    } catch {
        return false;
    }
};

const parse = (input: string, country: PhoneCountry | null) => {
    if (!country) return undefined;
    try {
        return parsePhoneNumberFromString(input, country as CountryCode);
    } catch {
        return undefined;
    }
};

/**
 * E.164 (`+819012345678`) — both the wire value and the local invite log's key.
 *
 * `chatic-backend-api`'s phone hasher (`asE164Phone`) only reads `countryCode` on a local (`0…`)
 * number and silently ignores it once the string already starts with `+`, so this is the one form
 * that is correct regardless of whether `countryCode` is trustworthy (ADR-0044 §5 correction — the
 * original design sent the local form instead, matching the client guide's literal wording). The log
 * needs the same property for a different reason: a representation that cannot collide across
 * countries, since local forms can (`09012345678` is a JP number and a plausible KR-shaped string).
 *
 * Both guarantees hold only on the happy path. Callers gate on `isValidMobileNumber` first, so a
 * parse failure here is not expected to happen; if it somehow does, this degrades to the raw input
 * digits — a bare local-looking string, NOT E.164 — rather than throwing mid-submit. That fallback
 * is a last resort for an unreachable case, not a second form this function promises to produce.
 */
export const toE164 = (input: string, country: PhoneCountry | null): string => {
    const parsed = parse(input, country);
    return parsed ? parsed.number : digitsOf(input);
};

/** A pasted international number, split into the country it declares and its local form. */
export interface InternationalPhoneInput {
    country: PhoneCountry;
    national: string;
}

/**
 * Reads a pasted `+…` number as a country declaration.
 *
 * Typing `+81…` says which country the number is in more precisely than the picker does, so the
 * picker follows the input instead of the two disagreeing. Anything else — no `+`, or a prefix too
 * short to identify a country — returns `null` and the caller leaves both alone.
 */
export const readInternationalInput = (input: string): InternationalPhoneInput | null => {
    const trimmed = input.trim();
    if (!trimmed.startsWith('+')) return null;
    let parsed: ReturnType<typeof parsePhoneNumberFromString>;
    try {
        parsed = parsePhoneNumberFromString(trimmed);
    } catch {
        return null;
    }
    if (!parsed?.country) return null;
    return { country: parsed.country, national: digitsOf(parsed.formatNational()) };
};

const readStoredCountry = (): PhoneCountry | null => {
    if (typeof window === 'undefined') return null;
    try {
        const stored = localStorage.getItem(COUNTRY_STORAGE_KEY);
        return stored && isSupportedCountry(stored) ? stored : null;
    } catch {
        return null;
    }
};

const readLocaleCountry = (): PhoneCountry | null => {
    if (typeof navigator === 'undefined') return null;
    try {
        const region = new Intl.Locale(navigator.language).region;
        return region && isSupportedCountry(region) ? region : null;
    } catch {
        return null;
    }
};

/**
 * Which country a phone field opens on: last explicit pick, then the device locale's region, then
 * nothing.
 *
 * The stored pick wins over the locale because it is the stronger signal — someone abroad on a
 * Korean-language device corrects it once and keeps it (ADR-0044 §4). `null` is a legitimate
 * answer, not a failure: `navigator.language` is often region-less (`en`), and an empty picker with
 * a disabled CTA says "pick one" without accusing the user of a mistake.
 */
export const resolveDefaultCountry = (): PhoneCountry | null => readStoredCountry() ?? readLocaleCountry();

/** Remembers an explicit pick. A storage-denied browser simply forgets it. */
export const rememberCountry = (country: PhoneCountry): void => {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(COUNTRY_STORAGE_KEY, country);
    } catch {
        // private mode / quota — the picker still works, it just reopens on the locale next time
    }
};
