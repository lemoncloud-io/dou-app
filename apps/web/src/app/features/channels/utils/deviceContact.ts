// What a device contact is worth showing and inviting by. Kept out of the page because the shape
// the two platforms deliver is a contract question, not a rendering detail — see
// apps/web/docs/feature/channels/invite.md for the per-platform field table.

import type { ContactInfo } from '@chatic/app-messages';

// Direct path for `phoneNumber`: it is deliberately kept out of the `utils` barrel (libphonenumber's
// metadata — see that barrel's comment).
import { toE164 } from '../../../utils/phoneNumber';
import { isValidKoreanPhone, normalizeKoreanPhone } from './koreanPhone';

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
 * Formats a COMPLETE Korean mobile number for display: `010-1234-5678`, and `011-234-5678` for the
 * older 10-digit numbers.
 *
 * Not `formatKoreanPhone`, which formats a number the user is still TYPING and therefore assumes
 * the 3-4-4 shape all the way through — feeding it a finished 10-digit number renders
 * `011-2345-678`, a number that does not exist. Splitting on the final length is only correct once
 * the number is complete, which is exactly the case here.
 */
const formatStoredKoreanPhone = (digits: string): string =>
    digits.length <= 10
        ? `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
        : `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;

/**
 * The number to SHOW, which is not always the number we would invite: a contact whose only number
 * is a landline still deserves to be identified by it. The invitable mobile wins when there is one,
 * so the row's label and the invite it sends agree.
 *
 * Anything we cannot read as a Korean mobile is returned exactly as the contact stored it —
 * reformatting a foreign or non-mobile number would only make it wrong.
 */
export const resolveContactDisplayPhone = (contact: ContactInfo): string => {
    const numbers = (contact.phoneNumbers ?? []).map(entry => trimmed(entry?.number)).filter(Boolean);
    for (const number of numbers) {
        const digits = normalizeKoreanPhone(number.replace(/\D/g, ''));
        if (isValidKoreanPhone(digits)) return formatStoredKoreanPhone(digits);
    }
    return numbers[0] ?? '';
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
 * Picks the **E.164** (`+8210…`) number to use for an invite from a contact. Returns null if
 * there's no valid Korean mobile number.
 *
 * Scans **all** of the stored numbers. The previous implementation only checked the first entry,
 * so a contact with a home or work number listed first was treated as having "no number" and the
 * invite itself was blocked — the contacts app doesn't guarantee number ordering.
 *
 * The wire value is E.164, not the local form (`010…`): the backend hasher (`asE164Phone`) only
 * reads `countryCode` for the local form, but the `user.invite-batch` payload has no field to
 * carry the country at all (`to`/`channelId`/`cloudId`/`cloudName`). So the country has to be
 * embedded in the number itself (ADR-0044 §5). Since this screen has no way to know a contact's
 * country, it keeps Korean number validation as-is and converts to KR.
 */
export const resolveContactPhone = (contact: ContactInfo): string | null => {
    for (const entry of contact.phoneNumbers ?? []) {
        const digits = trimmed(entry?.number).replace(/\D/g, '');
        if (!digits) continue;
        const normalized = normalizeKoreanPhone(digits);
        if (isValidKoreanPhone(normalized)) return toE164(normalized, 'KR');
    }
    return null;
};

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
    ]
        .map(part => trimmed(part))
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
};

const LETTER = /\p{L}/u;

const phoneDigits = (value: string): string => normalizeKoreanPhone(value.replace(/\D/g, ''));

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
 * by its digits, not its text: Android fills `displayName` of a contact saved with only a number
 * from that number exactly as stored (`01012345678`, `+82 10-…`), which never equals the formatted
 * `010-1234-5678` the line would show.
 */
export const resolveContactSubtitle = (contact: ContactInfo, name: string): string => {
    const phone = resolveContactDisplayPhone(contact);
    const numberIsTitle = phone !== '' && !LETTER.test(name) && phoneDigits(name) === phoneDigits(phone);
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
