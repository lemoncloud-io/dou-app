import type { Payer } from '../types';
import { isEmailAddress } from '../utils/email';

/** What the reader types into the payer fields, before it is checked. */
export interface PayerDraft {
    name: string;
    phone: string;
    /** Asked for only when no address is known for the account (`payerEmailOf`); empty otherwise. */
    email: string;
}

export const EMPTY_PAYER: PayerDraft = { name: '', phone: '', email: '' };

/**
 * The card company's limit on the holder's name. It counts bytes, and the payment window does not say
 * in which encoding, so UTF-8 is assumed: the stricter of the two for Korean (three bytes a syllable).
 */
const NAME_MAX_BYTES = 30;

const utf8Length = (value: string): number => new TextEncoder().encode(value).length;

/** Digits only: the payment window takes the number without separators. */
export const normalizePhone = (value: string): string => value.replace(/\D/g, '');

export const isPayerName = (name: string): boolean => {
    const trimmed = name.trim();
    return trimmed.length > 0 && utf8Length(trimmed) <= NAME_MAX_BYTES;
};

/** A Korean mobile number — the only kind a domestic card is registered with. */
export const isMobilePhone = (phone: string): boolean => /^01\d{8,9}$/.test(normalizePhone(phone));

export const isPayerComplete = (draft: PayerDraft): boolean => isPayerName(draft.name) && isMobilePhone(draft.phone);

/**
 * The address the card company is given: the one already known for the account — the verified billing
 * email, or the sign-in address — or else the one typed into the payer fields, once it is shaped like an
 * address. A social sign-in does not always leave an address on the account (Apple may share none, and
 * the server keeps only a masked hint of the provider's), and the card company will not register a card
 * without one, so the reader is asked for it rather than turned away.
 */
export const payerEmailOf = (known: string | undefined, draft: PayerDraft): string | undefined => {
    if (known) return known;
    const typed = draft.email.trim();
    return isEmailAddress(typed) ? typed : undefined;
};

/** The payer as the port takes it: trimmed, the number bare, with the address receipts go to. */
export const payerOf = (draft: PayerDraft, email: string): Payer => ({
    name: draft.name.trim(),
    phone: normalizePhone(draft.phone),
    email,
});
