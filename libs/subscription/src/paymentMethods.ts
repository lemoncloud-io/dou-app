import type { PaymentMethod, PaymentProvider } from './types';

export const cardsOf = (methods: PaymentMethod[], provider: PaymentProvider): PaymentMethod[] =>
    methods.filter(pm => pm.provider === provider);

export const defaultCardOf = (methods: PaymentMethod[], provider: PaymentProvider): PaymentMethod | undefined =>
    methods.find(pm => pm.provider === provider && pm.isDefault);

export interface CardGroup {
    provider: PaymentProvider;
    cards: PaymentMethod[];
}

const PROVIDER_ORDER: PaymentProvider[] = ['portone', 'stripe'];

export const cardGroupsOf = (methods: PaymentMethod[], current: PaymentProvider | undefined): CardGroup[] => {
    const order = current ? [current, ...PROVIDER_ORDER.filter(p => p !== current)] : PROVIDER_ORDER;
    return order
        .map(provider => ({ provider, cards: cardsOf(methods, provider) }))
        .filter(group => group.cards.length > 0);
};
