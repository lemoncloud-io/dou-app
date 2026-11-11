import type { CardEntryConfirmation } from '../cardEntry';

/**
 * What the dollar provider's card confirmation answered, as far as it is read here. Written down rather
 * than imported, so the reading can be tested without the provider's script.
 */
export interface SetupAnswer {
    error?: { type?: string; code?: string };
    setupIntent?: { status?: string; payment_method?: string | { id?: string } | null };
}

/**
 * Card errors the reader fixes by correcting what they typed. The field shows each one itself, and the
 * same setup can be confirmed again.
 */
const FIXABLE_CARD_ERRORS = [
    'incorrect_number',
    'invalid_number',
    'incorrect_cvc',
    'invalid_cvc',
    'expired_card',
    'invalid_expiry_month',
    'invalid_expiry_year',
    'incorrect_zip',
];

/**
 * A card confirmation's answer as the dialog acts on it, with the payment method it registered.
 *
 * - A field the reader has to fix (an incomplete number, a past expiry, a wrong security code) stays in
 *   the dialog: the field says what is wrong itself.
 * - An authentication the reader did not complete — a 3-D Secure check closed or failed — is a closed
 *   window, as with the won provider's: nothing was registered and nothing is wrong with the card.
 * - A card the card company refused, or anything else that went wrong, is a failed window.
 */
export const setupConfirmationOf = (answer: SetupAnswer): CardEntryConfirmation & { paymentMethod?: string } => {
    const { error, setupIntent } = answer;
    if (error) {
        if (error.type === 'validation_error') return { outcome: 'retry' };
        if (error.type === 'card_error' && FIXABLE_CARD_ERRORS.includes(error.code ?? '')) return { outcome: 'retry' };
        if (error.code === 'setup_intent_authentication_failure') return { outcome: 'closed' };
        return { outcome: 'failed' };
    }
    const method = setupIntent?.payment_method;
    const paymentMethod = typeof method === 'string' ? method : (method?.id ?? undefined);
    if (setupIntent?.status === 'succeeded' && paymentMethod) return { outcome: 'registered', paymentMethod };
    return { outcome: 'failed' };
};
