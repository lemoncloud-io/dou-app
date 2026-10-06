// What a device contact is worth showing and inviting by. Kept out of the page because the shape
// the two platforms deliver is a contract question, not a rendering detail — see
// apps/web/docs/feature/channels/invite.md for the per-platform field table.

import type { ContactInfo } from '@chatic/app-messages';

// Direct path for `phoneNumber`: it is deliberately kept out of the `utils` barrel (libphonenumber's
// metadata — see that barrel's comment).
import { readLocaleCountry, readMobileNumber, type MobileNumber, type PhoneCountry } from '../../../utils/phoneNumber';

/**
 * Hangul syllables, CJK ideographs and kana. A name written in any of them is ordered family-first
 * and carries no space between the parts, which is the opposite of the Latin convention.
 */
const CJK_NAME = /[㐀-鿿가-힯぀-ヿ]/;

const trimmed = (value?: string | null): string => value?.trim() ?? '';

/**
 * Builds a name out of the structured parts.
 *
 * Needed because `displayName` — the one field that already holds a composed name — is Android's
 * alone: iOS never sends the key (`RCTContacts.mm` has no `displayName` at all), so on iPhone the
 * parts are all there is.
 */
const composeName = (contact: ContactInfo): string => {
    const given = trimmed(contact.givenName);
    const middle = trimmed(contact.middleName);
    const family = trimmed(contact.familyName);
    const parts = [given, middle, family].filter(Boolean);
    if (parts.length === 0) return '';
    if (parts.some(part => CJK_NAME.test(part))) return [family, middle, given].filter(Boolean).join('');
    return parts.join(' ');
};

/**
 * The country a number saved WITHOUT a `+` is assumed to be in, before anything else is tried.
 *
 * Korea first, because that is where nearly every address book this app reads was filled in, and
 * because it keeps every contact that was invitable before international numbers were supported
 * reading exactly as it did.
 */
const HOME_COUNTRY: PhoneCountry = 'KR';

/**
 * Where a number saved without a `+` is tried, in order: Korea, then the device locale's region.
 *
 * The locale is the second guess because a local number is local to whoever saved it, and the
 * locale is the best signal for where that is — someone in Tokyo saves `090-…`, not `+81 90-…`. The
 * phone field's LAST PICKED country (`resolveDefaultCountry`) is deliberately not used: that names
 * the country of the last person invited by hand, which says nothing about the owner's own contacts,
 * and picking Japan once would otherwise turn every saved `010-…` into a Japanese number that fails.
 *
 * Korea before the locale, not after, so the order can only ADD invitable contacts: a number Korea
 * accepts never gets reread as somewhere else.
 */
const localCountries = (): PhoneCountry[] => {
    const locale = localeCountry();
    return locale && locale !== HOME_COUNTRY ? [HOME_COUNTRY, locale] : [HOME_COUNTRY];
};

let localeMemo: { language: string; country: PhoneCountry | null } | null = null;

/**
 * `readLocaleCountry`, re-read only when the language changes. The list asks for it on every number
 * it reads, several times per contact per render, and each answer is a fresh `Intl.Locale`.
 */
const localeCountry = (): PhoneCountry | null => {
    const language = typeof navigator === 'undefined' ? '' : navigator.language;
    if (localeMemo?.language !== language) localeMemo = { language, country: readLocaleCountry() };
    return localeMemo.country;
};

/** A stored mobile, plus whether it read as Korean while also being a mobile in the locale. */
interface StoredMobile extends MobileNumber {
    /**
     * Set only for a number saved without a `+` that Korea took first but the locale's country
     * would have taken too — `0171 2345678` on a German device, which is a German mobile and, read
     * as Korean, `017-1234-5678`. Korea still wins, so nothing invitable changes, but the row must
     * then show the `+82` so the guess is visible before a text goes to the wrong country.
     */
    ambiguous: boolean;
}

/**
 * Memo of `readStoredMobile`, keyed by the countries tried and the number exactly as stored — the
 * countries because the same `090-…` is a mobile or not depending on the locale.
 *
 * The list reads every contact's numbers several times per render — the filter, the search text,
 * the subtitle, the invitable check — and each read is a libphonenumber parse, where the Korean-only
 * check it replaces was one regex. The cap only stops a long session from growing it forever; an
 * address book is far smaller.
 */
const storedMobileCache = new Map<string, StoredMobile | null>();
const STORED_MOBILE_CACHE_MAX = 5000;

/** A stored number read as a mobile, from its own `+` country or else the local guesses in order. */
const readStoredMobile = (raw: string): StoredMobile | null => {
    const countries = localCountries();
    const key = `${countries.join(',')}|${raw}`;
    const cached = storedMobileCache.get(key);
    if (cached !== undefined) return cached;
    let found: StoredMobile | null = null;
    for (const [index, country] of countries.entries()) {
        const mobile = readMobileNumber(raw, country);
        if (!mobile) continue;
        // Only the first guess can be ambiguous: a `+` number names its own country, and a later
        // guess is reached only because every earlier one refused the number.
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

/**
 * How a mobile is shown: a Korean one the way Koreans dial it (`010-1234-5678`, `011-234-5678`),
 * any other — and a Korean reading the locale would have read differently — with its country code
 * (`+1 415 555 0123`, `+82 17-1234-5678`).
 *
 * A national form hides which country the number is in, and the invite goes to exactly that
 * country — the row should not leave the user to guess.
 */
const displayOf = (mobile: StoredMobile): string =>
    mobile.country === HOME_COUNTRY && !mobile.ambiguous ? mobile.national : mobile.international;

const storedNumbers = (contact: ContactInfo): string[] =>
    (contact.phoneNumbers ?? []).map(entry => trimmed(entry?.number)).filter(Boolean);

/** The first stored number that reads as a mobile — the one an invite would reach. */
const firstMobile = (contact: ContactInfo): StoredMobile | null => {
    for (const number of storedNumbers(contact)) {
        const mobile = readStoredMobile(number);
        if (mobile) return mobile;
    }
    return null;
};

/**
 * The number to SHOW, which is not always the number we would invite: a contact whose only number
 * is a landline still deserves to be identified by it. The invitable mobile wins when there is one,
 * so the row's label and the invite it sends agree.
 *
 * Anything we cannot read as a mobile is returned exactly as the contact stored it — reformatting a
 * landline or a malformed number would only make it look more valid than it is.
 */
export const resolveContactDisplayPhone = (contact: ContactInfo): string => {
    const mobile = firstMobile(contact);
    return mobile ? displayOf(mobile) : (storedNumbers(contact)[0] ?? '');
};

/**
 * What the picker calls this contact.
 *
 * A chain, not a field: the contacts app makes every one of these optional, and reading only
 * `displayName`/`givenName` rendered a blank row for anyone saved under a family name alone, a
 * company name, or a bare number — which on iOS is every contact without a first name, since the
 * platform sends neither `displayName` nor an empty `givenName` key.
 *
 * The number is a real answer, not a placeholder: it is what the user would dial, and it is enough
 * to recognise who the row is.
 *
 * `fallback` is a guard, not a live path. It needs a contact with no name AND no number, and the
 * picker leaves those out of the list entirely (`listedContacts` gates on this very function
 * returning a number). It stays because the alternative is rendering an empty row, which is the bug
 * this chain exists to end — if a caller ever lists a contact this one cannot name, it should read
 * as deliberate rather than broken.
 */
export const resolveContactName = (contact: ContactInfo, fallback: string): string =>
    trimmed(contact.displayName) ||
    composeName(contact) ||
    trimmed(contact.company) ||
    resolveContactDisplayPhone(contact) ||
    fallback;

/**
 * Picks the **E.164** number (`+821012345678`, `+14155550123`) to use for an invite from a
 * contact. Returns null if no stored number is a mobile.
 *
 * Scans **all** of the stored numbers. The previous implementation only checked the first entry,
 * so a contact with a home or work number listed first was treated as having "no number" and the
 * invite itself was blocked — the contacts app doesn't guarantee number ordering.
 *
 * A number saved with a `+` is read in the country it names; one saved without is read as Korean,
 * then as the device locale's country (see `localCountries`). Mobile only, because every invite is
 * delivered by text.
 *
 * The wire value is E.164, not the local form (`010…`): the backend hasher (`asE164Phone`) only
 * reads `countryCode` for the local form, but the `user.invite-batch` payload has no field to
 * carry the country at all (`to`/`channelId`/`cloudId`/`cloudName`). So the country has to be
 * embedded in the number itself. A Korean number keeps matching the records made
 * before: the backend stores `+82…` as `010…`.
 */
export const resolveContactPhone = (contact: ContactInfo): string | null => firstMobile(contact)?.e164 ?? null;

/**
 * Everything a search should match, lowercased.
 *
 * Includes the company and the shown number because both can BE the row's label — searching for
 * what is on screen and getting nothing back would be its own bug. The number goes in twice, as
 * shown and as bare digits, so `010-1234` and `0101234` both find it.
 *
 * The composed name goes in too, and it is not the parts repeated: on iOS there is no
 * `displayName`, so the row reads `김민수` while the parts alone join to `민수 김` — typing exactly
 * what the row shows found nothing. The job title is here because the subtitle shows it.
 */
export const contactSearchText = (contact: ContactInfo): string => {
    const phone = resolveContactDisplayPhone(contact);
    // The national form too, when the row shows the international one: a number saved as
    // `090-1234-5678` on a Japanese device is shown `+81 90 1234 5678`, and searching `090` — what the
    // owner typed when saving it — has to keep finding it.
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

/** Compares two numbers as numbers: the same mobile written two ways is the same, else digit by digit. */
const sameNumber = (a: string, b: string): boolean =>
    (readStoredMobile(a)?.e164 ?? a.replace(/\D/g, '')) === (readStoredMobile(b)?.e164 ?? b.replace(/\D/g, ''));

/**
 * The row's second line: the shown number — the invitable mobile whenever the contact has one —
 * then who they are at work.
 *
 * Exists because a name alone cannot tell two `김민수` apart, and the row never said which number
 * an invite would reach. It shows only fields both platforms deliver — iOS sends no department,
 * nickname or starred flag, so a line built from those would be an Android-only feature.
 *
 * `name` is what the row already shows. The chain in `resolveContactName` falls back to the company
 * or the number, and repeating the title on the line under it says nothing. The number is compared
 * as a number, not as text: Android fills `displayName` of a contact saved with only a number from
 * that number exactly as stored (`01012345678`, `+82 10-…`), which never equals the formatted
 * `010-1234-5678` the line would show.
 */
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

/**
 * Which block a label sorts into, following the phone book people already know: Hangul, then Latin,
 * then any other script, and labels that start with a digit or a symbol last — the `#` block.
 *
 * `localeCompare('ko')` alone is not that order: it puts digits and symbols FIRST, and since a
 * contact with no name is labelled by its number, every such row would lead the list.
 *
 * Classified after NFC normalisation: a name stored decomposed starts with a conjoining jamo, which
 * the Hangul range does not cover, and would otherwise sort after every Latin name.
 */
const sortBlock = (raw: string): number => {
    const label = raw.normalize('NFC');
    if (HANGUL_LEADING.test(label)) return 0;
    if (LATIN_LEADING.test(label)) return 1;
    if (LETTER_LEADING.test(label)) return 2;
    return 3;
};

const koreanCollator = new Intl.Collator('ko', { sensitivity: 'base', numeric: true });

/** Orders two row labels by block, then by Korean collation within the block. */
export const compareContactLabels = (a: string, b: string): number =>
    sortBlock(a) - sortBlock(b) || koreanCollator.compare(a, b);
