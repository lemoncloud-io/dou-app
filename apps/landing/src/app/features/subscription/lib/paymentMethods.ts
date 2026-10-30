import type { PaymentMethod, PaymentProvider } from '../types';

/**
 * An account's cards belong to the provider that registered them, and each provider has its own default.
 * A subscription is charged by one provider, so wherever a screen speaks of "the card" it means a card
 * of the subscription's provider, and of the provider's default among those.
 */

export const cardsOf = (methods: PaymentMethod[], provider: PaymentProvider): PaymentMethod[] =>
    methods.filter(pm => pm.provider === provider);

/** The card `provider` charges, if it holds one. */
export const defaultCardOf = (methods: PaymentMethod[], provider: PaymentProvider): PaymentMethod | undefined =>
    methods.find(pm => pm.provider === provider && pm.isDefault);

export interface CardGroup {
    provider: PaymentProvider;
    cards: PaymentMethod[];
}

const PROVIDER_ORDER: PaymentProvider[] = ['portone', 'stripe'];

/**
 * The cards grouped by provider, for the payment methods page: the provider in use first, then the
 * other, and a group only where it has cards. With no subscription the order is the fixed one.
 */
export const cardGroupsOf = (methods: PaymentMethod[], current: PaymentProvider | undefined): CardGroup[] => {
    const order = current ? [current, ...PROVIDER_ORDER.filter(p => p !== current)] : PROVIDER_ORDER;
    return order
        .map(provider => ({ provider, cards: cardsOf(methods, provider) }))
        .filter(group => group.cards.length > 0);
};
