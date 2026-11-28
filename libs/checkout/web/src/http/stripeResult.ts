import type { CardEntryConfirmation } from '../port/cardEntry';

export interface SetupAnswer {
    error?: { type?: string; code?: string };
    setupIntent?: { status?: string; payment_method?: string | { id?: string } | null };
}

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
