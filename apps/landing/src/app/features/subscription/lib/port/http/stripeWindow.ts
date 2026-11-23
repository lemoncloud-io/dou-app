import { loadStripe } from '@stripe/stripe-js/pure';

import type { Appearance, Stripe, StripeElements, StripePaymentElement } from '@stripe/stripe-js';

import { setupConfirmationOf } from './stripeResult';

import type { PaymentWindow, PaymentWindowResult } from './createHttpPort';
import type { CardEntryChannel } from '../cardEntry';

const APPEARANCE: Appearance = {
    theme: 'stripe',
    variables: {
        colorPrimary: '#102346',
        colorText: '#12131a',
        colorDanger: '#c1292e',
        borderRadius: '8px',
    },
};

const isRegionCode = (country: string | undefined): country is string => !!country && /^[A-Z]{2}$/.test(country);

export const createStripeWindow =
    (channel: CardEntryChannel): PaymentWindow =>
    async ({ issue, country, terms }): Promise<PaymentWindowResult> => {
        if (issue.provider !== 'stripe') throw new Error('not a card registration for the card field');
        let stripe: Stripe | null = null;
        let elements: StripeElements | undefined;
        let element: StripePaymentElement | undefined;
        let paymentMethod: string | undefined;
        let closed = false;

        const outcome = await channel.open({
            terms,
            mount: async (node, language) => {
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
