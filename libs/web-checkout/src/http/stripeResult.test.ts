import { setupConfirmationOf } from './stripeResult';

describe('setupConfirmationOf', () => {
    it('registers a confirmed setup with the payment method it saved', () => {
        expect(setupConfirmationOf({ setupIntent: { status: 'succeeded', payment_method: 'pm_1' } })).toEqual({
            outcome: 'registered',
            paymentMethod: 'pm_1',
        });
        expect(setupConfirmationOf({ setupIntent: { status: 'succeeded', payment_method: { id: 'pm_2' } } })).toEqual({
            outcome: 'registered',
            paymentMethod: 'pm_2',
        });
    });

    it('keeps the dialog open for a field the reader has to fix', () => {
        expect(setupConfirmationOf({ error: { type: 'validation_error', code: 'incomplete_number' } })).toEqual({
            outcome: 'retry',
        });
    });

    it('reads a card security check not completed as a closed window, and a refused card as a failed one', () => {
        const auth = { type: 'invalid_request_error', code: 'setup_intent_authentication_failure' };
        expect(setupConfirmationOf({ error: auth })).toEqual({ outcome: 'closed' });
        expect(setupConfirmationOf({ error: { type: 'card_error', code: 'card_declined' } })).toEqual({
            outcome: 'failed',
        });
        expect(setupConfirmationOf({ error: { type: 'api_error' } })).toEqual({ outcome: 'failed' });
    });

    it('fails a setup that did not succeed or carries no payment method', () => {
        expect(setupConfirmationOf({ setupIntent: { status: 'requires_payment_method' } })).toEqual({
            outcome: 'failed',
        });
        expect(setupConfirmationOf({ setupIntent: { status: 'succeeded', payment_method: null } })).toEqual({
            outcome: 'failed',
        });
    });
});
