import { parsePhoneNumberFromString } from 'libphonenumber-js/mobile';

/**
 * Reads the invite dialog's plain phone field into E.164.
 *
 * The dialog ships no country picker (desktop idiom), so the field must read
 * both forms on its own: an international `+…` number parses as itself, and a
 * Korean local form (`010-…`) falls back to a KR parse. Anything else is
 * `invalid` — the dialog shows an inline error and sends nothing, and the
 * server remains the final verdict on the value.
 */
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
