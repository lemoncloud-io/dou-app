import type { ContactInfo } from '@chatic/bridge-messages';

import { readLocaleCountry, readMobileNumber, type MobileNumber, type PhoneCountry } from '@chatic/shared/phone';

const CJK_NAME = /[㐀-鿿가-힯぀-ヿ]/;

const trimmed = (value?: string | null): string => value?.trim() ?? '';

const composeName = (contact: ContactInfo): string => {
    const given = trimmed(contact.givenName);
    const middle = trimmed(contact.middleName);
    const family = trimmed(contact.familyName);
    const parts = [given, middle, family].filter(Boolean);
    if (parts.length === 0) return '';
    if (parts.some(part => CJK_NAME.test(part))) return [family, middle, given].filter(Boolean).join('');
    return parts.join(' ');
};

const HOME_COUNTRY: PhoneCountry = 'KR';

const localCountries = (): PhoneCountry[] => {
    const locale = localeCountry();
    return locale && locale !== HOME_COUNTRY ? [HOME_COUNTRY, locale] : [HOME_COUNTRY];
};

let localeMemo: { language: string; country: PhoneCountry | null } | null = null;

const localeCountry = (): PhoneCountry | null => {
    const language = typeof navigator === 'undefined' ? '' : navigator.language;
    if (localeMemo?.language !== language) localeMemo = { language, country: readLocaleCountry() };
    return localeMemo.country;
};

interface StoredMobile extends MobileNumber {
    ambiguous: boolean;
}

const storedMobileCache = new Map<string, StoredMobile | null>();
const STORED_MOBILE_CACHE_MAX = 5000;

const readStoredMobile = (raw: string): StoredMobile | null => {
    const countries = localCountries();
    const key = `${countries.join(',')}|${raw}`;
    const cached = storedMobileCache.get(key);
    if (cached !== undefined) return cached;
    let found: StoredMobile | null = null;
    for (const [index, country] of countries.entries()) {
        const mobile = readMobileNumber(raw, country);
        if (!mobile) continue;
        const ambiguous =
            index === 0 &&
            !raw.startsWith('+') &&
            countries.slice(1).some(other => readMobileNumber(raw, other) !== null);
        found = { ...mobile, ambiguous };
        break;
    }
    if (storedMobileCache.size >= STORED_MOBILE_CACHE_MAX) storedMobileCache.clear();
    storedMobileCache.set(key, found);
    return found;
};

const displayOf = (mobile: StoredMobile): string =>
    mobile.country === HOME_COUNTRY && !mobile.ambiguous ? mobile.national : mobile.international;

const storedNumbers = (contact: ContactInfo): string[] =>
    (contact.phoneNumbers ?? []).map(entry => trimmed(entry?.number)).filter(Boolean);

const firstMobile = (contact: ContactInfo): StoredMobile | null => {
    for (const number of storedNumbers(contact)) {
        const mobile = readStoredMobile(number);
        if (mobile) return mobile;
    }
    return null;
};

export const resolveContactDisplayPhone = (contact: ContactInfo): string => {
    const mobile = firstMobile(contact);
    return mobile ? displayOf(mobile) : (storedNumbers(contact)[0] ?? '');
};

export const resolveContactName = (contact: ContactInfo, fallback: string): string =>
    trimmed(contact.displayName) ||
    composeName(contact) ||
    trimmed(contact.company) ||
    resolveContactDisplayPhone(contact) ||
    fallback;

export const resolveContactPhone = (contact: ContactInfo): string | null => firstMobile(contact)?.e164 ?? null;

export const contactSearchText = (contact: ContactInfo): string => {
    const phone = resolveContactDisplayPhone(contact);
    const national = firstMobile(contact)?.national ?? '';
    return [
        contact.displayName,
        composeName(contact),
        contact.jobTitle,
        contact.givenName,
        contact.middleName,
        contact.familyName,
        contact.company,
        phone,
        phone.replace(/\D/g, ''),
        national,
        national.replace(/\D/g, ''),
    ]
        .map(part => trimmed(part))
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
};

const LETTER = /\p{L}/u;

const sameNumber = (a: string, b: string): boolean =>
    (readStoredMobile(a)?.e164 ?? a.replace(/\D/g, '')) === (readStoredMobile(b)?.e164 ?? b.replace(/\D/g, ''));

export const resolveContactSubtitle = (contact: ContactInfo, name: string): string => {
    const phone = resolveContactDisplayPhone(contact);
    const numberIsTitle = phone !== '' && !LETTER.test(name) && sameNumber(name, phone);
    return [numberIsTitle ? '' : phone, trimmed(contact.company), trimmed(contact.jobTitle)]
        .filter(part => part && part !== name)
        .join(' · ');
};

const HANGUL_LEADING = /^[ㄱ-ㆎ가-힯]/;
const LATIN_LEADING = /^\p{Script=Latin}/u;
const LETTER_LEADING = /^\p{L}/u;

const sortBlock = (raw: string): number => {
    const label = raw.normalize('NFC');
    if (HANGUL_LEADING.test(label)) return 0;
    if (LATIN_LEADING.test(label)) return 1;
    if (LETTER_LEADING.test(label)) return 2;
    return 3;
};

const koreanCollator = new Intl.Collator('ko', { sensitivity: 'base', numeric: true });

export const compareContactLabels = (a: string, b: string): number =>
    sortBlock(a) - sortBlock(b) || koreanCollator.compare(a, b);
