import type { Payer } from '../types';
import { isEmailAddress } from '../utils/email';

export interface PayerDraft {
    name: string;
    phone: string;
    email: string;
}

export const EMPTY_PAYER: PayerDraft = { name: '', phone: '', email: '' };

const NAME_MAX_BYTES = 30;

const utf8Length = (value: string): number => new TextEncoder().encode(value).length;

export const normalizePhone = (value: string): string => value.replace(/\D/g, '');

export const isPayerName = (name: string): boolean => {
    const trimmed = name.trim();
    return trimmed.length > 0 && utf8Length(trimmed) <= NAME_MAX_BYTES;
};

export const isMobilePhone = (phone: string): boolean => /^01\d{8,9}$/.test(normalizePhone(phone));

export const isPayerComplete = (draft: PayerDraft): boolean => isPayerName(draft.name) && isMobilePhone(draft.phone);

export const payerEmailOf = (known: string | undefined, draft: PayerDraft): string | undefined => {
    if (known) return known;
    const typed = draft.email.trim();
    return isEmailAddress(typed) ? typed : undefined;
};

export const payerOf = (draft: PayerDraft, email: string): Payer => ({
    name: draft.name.trim(),
    phone: normalizePhone(draft.phone),
    email,
});
