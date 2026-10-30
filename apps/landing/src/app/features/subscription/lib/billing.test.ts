import { currencyOfLanguage, currencyOfProvider, providerOfCurrency } from './billingCountry';
import { PLAN_CATALOG, planCatalogIn } from './catalog';
import { cardGroupsOf, cardsOf, defaultCardOf } from './paymentMethods';

import type { PaymentMethod } from '../types';

const card = (id: string, provider: PaymentMethod['provider'], isDefault = false): PaymentMethod => ({
    id,
    provider,
    brand: 'Brand',
    last4: '1234',
    isDefault,
});

describe('the plan catalog', () => {
    it('sells the same tiers in won and in dollars, dollars in cents at $6 a step', () => {
        expect(PLAN_CATALOG.map(plan => plan.monthly)).toEqual(
            [1, 2, 3, 4, 5].map(sort => ({ amount: 8600 * sort, currency: 'KRW' }))
        );
        expect(planCatalogIn('USD').map(plan => plan.monthly)).toEqual(
            [1, 2, 3, 4, 5].map(sort => ({ amount: 600 * sort, currency: 'USD' }))
        );
        expect(planCatalogIn('USD').map(plan => plan.id)).toEqual(PLAN_CATALOG.map(plan => plan.id));
    });
});

describe('currencies', () => {
    it('reads a Korean page in won and any other language in dollars', () => {
        expect(currencyOfLanguage('ko')).toBe('KRW');
        expect(currencyOfLanguage('ko-KR')).toBe('KRW');
        expect(currencyOfLanguage('en')).toBe('USD');
        expect(currencyOfLanguage('ja')).toBe('USD');
    });

    it('pairs each currency with one provider, both ways', () => {
        expect(providerOfCurrency('KRW')).toBe('portone');
        expect(providerOfCurrency('USD')).toBe('stripe');
        expect(currencyOfProvider('portone')).toBe('KRW');
        expect(currencyOfProvider('stripe')).toBe('USD');
    });
});

describe('cards by provider', () => {
    const methods = [
        card('w1', 'portone', true),
        card('d1', 'stripe'),
        card('w2', 'portone'),
        card('d2', 'stripe', true),
    ];

    it('finds the default within one provider, so an account can have two', () => {
        expect(defaultCardOf(methods, 'portone')?.id).toBe('w1');
        expect(defaultCardOf(methods, 'stripe')?.id).toBe('d2');
        expect(cardsOf(methods, 'stripe').map(pm => pm.id)).toEqual(['d1', 'd2']);
    });

    it('groups the provider in use first, and leaves out a provider with no cards', () => {
        expect(cardGroupsOf(methods, 'stripe').map(group => group.provider)).toEqual(['stripe', 'portone']);
        expect(cardGroupsOf(methods, undefined).map(group => group.provider)).toEqual(['portone', 'stripe']);
        expect(cardGroupsOf([card('d1', 'stripe')], 'portone')).toEqual([
            { provider: 'stripe', cards: [card('d1', 'stripe')] },
        ]);
    });
});
