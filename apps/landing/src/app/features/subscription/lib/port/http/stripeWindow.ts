import { loadStripe } from '@stripe/stripe-js/pure';

import type { Appearance, Stripe, StripeElements, StripePaymentElement } from '@stripe/stripe-js';

import { setupConfirmationOf } from './stripeResult';

import type { PaymentWindow, PaymentWindowResult } from './createHttpPort';
import type { CardEntryChannel } from '../cardEntry';

/** The card field drawn in the account surface's own colours, on the provider's default look. */
const APPEARANCE: Appearance = {
    theme: 'stripe',
    variables: {
        colorPrimary: '#102346',
        colorText: '#12131a',
        colorDanger: '#c1292e',
        borderRadius: '8px',
    },
};

/** A billing country the card field can start from: an ISO code, not the picker's `OTHER`. */
const isRegionCode = (country: string | undefined): country is string => !!country && /^[A-Z]{2}$/.test(country);

/**
 * The dollar provider's card entry (Stripe). Unlike the won provider it has no window of its own: its
 * Payment Element — a card field, since the server's setup intent allows cards only — is drawn inside our
 * dialog (`CardEntryWindow`, through `channel`), under our consent line, and the card is registered with
 * `confirmSetup`. A 3-D Secure check, when the card asks for one, is the provider's own overlay over the
 * page. The publishable key and the client secret come from the server's `issue` answer and live only
 * for this call — never in configuration, storage or a log. The registered payment method goes back to
 * the port as the card's key; the screens never see it.
 *
 * The field asks for what the provider needs with a card (the country and, where it applies, a postal
 * code) and starts from the billing country chosen on W-08. Nothing else of the payer is sent.
 */
export const createStripeWindow =
    (channel: CardEntryChannel): PaymentWindow =>
    async ({ issue, country, terms }): Promise<PaymentWindowResult> => {
        if (issue.provider !== 'stripe') throw new Error('not a card registration for the card field');
        let stripe: Stripe | null = null;
        let elements: StripeElements | undefined;
        let element: StripePaymentElement | undefined;
        let paymentMethod: string | undefined;
        // The dialog can close while the script or the field is still loading; what arrives after that
        // is taken away at once.
        let closed = false;

        const outcome = await channel.open({
            terms,
            mount: async (node, language) => {
                // The provider's script is fetched here, on the first card of the page, and not before.
                stripe = await loadStripe(issue.publishableKey);
                if (closed) return;
                if (!stripe) throw new Error('the card field did not load');
                elements = stripe.elements({
                    clientSecret: issue.clientSecret,
                    appearance: APPEARANCE,
                    locale: language.startsWith('ko') ? 'ko' : 'en',
                });
                const created = elements.create('payment', {
                    defaultValues: isRegionCode(country) ? { billingDetails: { address: { country } } } : undefined,
                });
                element = created;
                // An expired secret or a blocked frame answers `loaderror` and never `ready`.
                await new Promise<void>((resolve, reject) => {
                    created.on('ready', () => resolve());
                    created.on('loaderror', event =>
                        reject(new Error(`the card field did not load: ${event.error.type}`))
                    );
                    created.mount(node);
                });
            },
            confirm: async () => {
                if (!stripe || !elements) return { outcome: 'failed' };
                try {
                    const answer = await stripe.confirmSetup({ elements, redirect: 'if_required' });
                    const confirmation = setupConfirmationOf(answer);
                    // The error is reported by its kind alone: the provider's error object can carry the
                    // setup intent, client secret included.
                    if (answer.error) console.warn('card setup refused', answer.error.type, answer.error.code);
                    if (confirmation.outcome === 'registered') paymentMethod = confirmation.paymentMethod;
                    return confirmation.outcome === 'registered' ? { outcome: 'registered' } : confirmation;
                } catch (error) {
                    console.warn('card setup failed', error instanceof Error ? error.name : typeof error);
                    return { outcome: 'failed' };
                }
            },
            unmount: () => {
                closed = true;
                element?.destroy();
            },
        });

        if (outcome !== 'registered') return { outcome };
        return paymentMethod ? { outcome: 'registered', billingKey: paymentMethod } : { outcome: 'failed' };
    };
