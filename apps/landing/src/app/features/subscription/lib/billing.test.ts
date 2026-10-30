import {
    BILLING_COUNTRY_OPTIONS,
    currencyOfCountry,
    currencyOfLanguage,
    currencyOfProvider,
    isBillingCountry,
    lockedCountryOf,
    payerRequiredFor,
    payerRequiredIn,
    providerOfCountry,
    providerOfCurrency,
} from './billingCountry';
import { PLAN_CATALOG, planCatalogIn } from './catalog';
import { cardGroupsOf, cardsOf, defaultCardOf } from './paymentMethods';
import { type CardEntryRequest, createCardEntryChannel } from './port/cardEntry';

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

describe('billing country', () => {
    it('bills Korea in won with a payer, and every other country in dollars without one', () => {
        expect(currencyOfCountry('KR')).toBe('KRW');
        expect(providerOfCountry('KR')).toBe('portone');
        expect(payerRequiredIn('KR')).toBe(true);
        for (const country of ['US', 'JP', 'OTHER']) {
            expect(currencyOfCountry(country)).toBe('USD');
            expect(providerOfCountry(country)).toBe('stripe');
            expect(payerRequiredIn(country)).toBe(false);
        }
    });

    it('holds a running subscription to its own country', () => {
        expect(lockedCountryOf('portone')).toBe('KR');
        expect(lockedCountryOf('stripe')).toBe('OTHER');
        expect(payerRequiredFor('portone')).toBe(true);
        expect(payerRequiredFor('stripe')).toBe(false);
    });

    it('offers Korea first, and knows only the countries it offers', () => {
        expect(BILLING_COUNTRY_OPTIONS[0]).toBe('KR');
        expect(isBillingCountry('US')).toBe(true);
        expect(isBillingCountry('')).toBe(false);
        expect(isBillingCountry('IN')).toBe(false);
    });
});

describe('the card entry channel', () => {
    const request = (): CardEntryRequest => ({
        terms: {},
        mount: async () => undefined,
        confirm: async () => ({ outcome: 'registered' }),
        unmount: () => undefined,
    });

    it('shows one request and resolves it with how the dialog ended', async () => {
        const channel = createCardEntryChannel();
        const listener = vi.fn();
        channel.subscribe(listener);
        const first = request();
        const done = channel.open(first);
        expect(channel.pending()).toBe(first);
        channel.finish('registered');
        expect(await done).toBe('registered');
        expect(channel.pending()).toBeNull();
        expect(listener).toHaveBeenCalledTimes(2);
    });

    it('closes a request still open when another arrives', async () => {
        const channel = createCardEntryChannel();
        const first = channel.open(request());
        const second = channel.open(request());
        expect(await first).toBe('closed');
        channel.finish('failed');
        expect(await second).toBe('failed');
    });
});
