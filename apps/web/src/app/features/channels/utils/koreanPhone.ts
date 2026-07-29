// Korean mobile phone helpers shared by the cloud invite flow (InvitePage/AddFriendSheet) and the
// relay 1:1 invite sender flow (features/invite). Extracted from what used to be two near-identical
// private copies so both flows validate/normalize/format the same way (ADR-0033 Track B).

/** Valid Korean mobile prefixes: 010, 011, 016, 017, 018, 019 */
export const KOREAN_MOBILE_PREFIXES = ['010', '011', '016', '017', '018', '019'] as const;

/** Digits a Korean mobile number is expected to have once normalized (local `0…` form). */
export const KOREAN_PHONE_DIGITS_MAX = 11;

/** Normalize the +82 international form (`82…`) to the local form (`0…`). Already-local input passes through. */
export const normalizeKoreanPhone = (digits: string): string => {
    if (digits.startsWith('82') && digits.length >= 12) {
        return '0' + digits.slice(2);
    }
    return digits;
};

/** True when `digits` (after normalization) is a plausible Korean mobile number. */
export const isValidKoreanPhone = (digits: string): boolean => {
    const normalized = normalizeKoreanPhone(digits);
    if (normalized.length < 10 || normalized.length > 11) return false;
    return KOREAN_MOBILE_PREFIXES.some(prefix => normalized.startsWith(prefix));
};

/** Format raw digits as `010-1234-5678` while the user is still typing (partial input renders partially). */
export const formatKoreanPhone = (digits: string): string => {
    if (digits.length <= 3) return digits;
    if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
};
