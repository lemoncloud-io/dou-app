import { parsePhoneNumberFromString } from 'libphonenumber-js/mobile';

export const parseInvitePhone = (input: string): { e164: string } | { error: 'invalid' } => {
    const trimmed = input.trim();
    if (!trimmed) return { error: 'invalid' };
    try {
        const international = parsePhoneNumberFromString(trimmed);
        if (international?.isValid()) return { e164: international.number };
    } catch {
        // Fall through to the local-form parse below.
    }
    try {
        const local = parsePhoneNumberFromString(trimmed, 'KR');
        if (local?.isValid() && local.country === 'KR') return { e164: local.number };
    } catch {
        // Invalid input — reported below, never thrown.
    }
    return { error: 'invalid' };
};
