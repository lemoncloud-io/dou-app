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
 * 연락처에서 초대에 쓸 **E.164**(`+8210…`) 번호를 고릅니다. 유효한 한국 휴대폰이 없으면 null.
 *
 * 저장된 번호 **전부**를 훑습니다. 첫 칸만 보던 이전 구현은 집·회사 번호가 앞에 있는 연락처를
 * "번호 없음"으로 취급해 초대 자체를 막았다 — 연락처 앱은 번호 순서를 보장하지 않는다.
 *
 * wire 값은 로컬형(`010…`)이 아니라 E.164다: 백엔드 해셔(`asE164Phone`)는 로컬형일 때만
 * `countryCode`를 읽는데, `user.invite-batch` 페이로드에는 국가를 실을 자리가 아예 없다
 * (`to`/`channelId`/`cloudId`/`cloudName`). 즉 국가가 번호 안에 들어 있어야 한다 (ADR-0044 §5).
 * 이 화면은 연락처가 국가를 알려주지 않으므로 한국 번호 검증을 그대로 유지하고 KR로 변환한다.
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
 */
export const contactSearchText = (contact: ContactInfo): string => {
    const phone = resolveContactDisplayPhone(contact);
    return [
        contact.displayName,
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
