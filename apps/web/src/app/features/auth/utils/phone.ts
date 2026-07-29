// Korean mobile number helpers for the phone-verification flow. Same rules as the invite senders
// (channels/AddFriendSheet, channels/InvitePage keep local copies — a shared util does not exist yet).

export const PHONE_DIGITS_MAX = 11;

// Valid Korean mobile prefixes: 010, 011, 016, 017, 018, 019
const KOREAN_MOBILE_PREFIXES = ['010', '011', '016', '017', '018', '019'];

/** Whether a bare digit string is a plausible Korean mobile number (10-11 digits, mobile prefix). */
export const isValidKoreanPhone = (digits: string): boolean => {
    if (digits.length < 10 || digits.length > 11) return false;
    return KOREAN_MOBILE_PREFIXES.some(prefix => digits.startsWith(prefix));
};

/** Renders bare digits as the familiar dashed form while typing (010-1234-5678). */
export const formatPhoneNumber = (digits: string): string => {
    if (digits.length <= 3) return digits;
    if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
};
