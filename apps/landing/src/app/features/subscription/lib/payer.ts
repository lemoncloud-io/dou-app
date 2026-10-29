import type { Payer } from '../types';

/** What the reader types into the payer fields, before it is checked. */
export interface PayerDraft {
    name: string;
    phone: string;
}

export const EMPTY_PAYER: PayerDraft = { name: '', phone: '' };

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

/** The payer as the port takes it: trimmed, the number bare, with the address receipts go to. */
export const payerOf = (draft: PayerDraft, email: string): Payer => ({
    name: draft.name.trim(),
    phone: normalizePhone(draft.phone),
    email,
});
