import {
    attemptFromSubscription,
    attemptId,
    billingSourceOf,
    isExpiringSoon,
    parseAttemptId,
    prorate,
    toAccount,
    toCatalog,
    toPaymentMethod,
    toSubscription,
} from './wire';

// The dev stage's web products as `GET /products/0/plans?platform=portone` lists them.
const PRODUCTS = [2, 1, 3, 4, 5].map(sort => ({
    id: `dou-web-tier-0${sort}_dev`,
    sort,
    maxClouds: sort,
    price: 8600 * sort,
    currency: 'KRW',
    trialDays: 7,
}));
const CATALOG = toCatalog(PRODUCTS, 'portone');

// The dollar products, priced in cents as the server lists them.
const STRIPE_PRODUCTS = [1, 2, 3, 4, 5].map(sort => ({
    id: `dou-web-stripe-tier-0${sort}_dev`,
    platform: 'stripe',
    sort,
    maxClouds: sort,
    price: 600 * sort,
    currency: 'USD',
    trialDays: 7,
}));

// Local noon, so the calendar day is the same in every time zone the test runs in.
const at = (iso: string) => new Date(`${iso}T12:00:00`).getTime();

describe('toCatalog', () => {
    it('names each web product after its tier, in tier order, keeping the server id beside it', () => {
        expect(CATALOG.map(plan => [plan.id, plan.productId])).toEqual([
            ['pro-tier-01', 'dou-web-tier-01_dev'],
            ['pro-tier-02', 'dou-web-tier-02_dev'],
            ['pro-tier-03', 'dou-web-tier-03_dev'],
            ['pro-tier-04', 'dou-web-tier-04_dev'],
            ['pro-tier-05', 'dou-web-tier-05_dev'],
        ]);
        expect(CATALOG[1]).toMatchObject({
            sort: 2,
            maxClouds: 2,
            monthly: { amount: 17200, currency: 'KRW' },
            trialDays: 7,
        });
    });

    it('drops a product outside the five tiers or without a price', () => {
        expect(
            toCatalog(
                [
                    { id: 'x', sort: 6, price: 1 },
                    { id: 'y', sort: 1 },
                ],
                'portone'
            )
        ).toEqual([]);
    });

    it('keeps a dollar price in cents and pairs it with the same tier', () => {
        const stripe = toCatalog(STRIPE_PRODUCTS, 'stripe');
        expect(stripe[1]).toMatchObject({
            id: 'pro-tier-02',
            monthly: { amount: 1200, currency: 'USD' },
            productId: 'dou-web-stripe-tier-02_dev',
            provider: 'stripe',
        });
        expect(CATALOG[1].provider).toBe('portone');
    });

    it('drops a product that says it belongs to another provider than the list asked for', () => {
        expect(toCatalog(STRIPE_PRODUCTS, 'portone')).toEqual([]);
    });
});

describe('toSubscription', () => {
    const base = { id: 'U1:portone', productId: '#dou-web-tier-02_dev', validFrom: at('2026-11-01') };

    it('reads a trial: its end is also the first charge', () => {
        expect(toSubscription({ ...base, status: 'trial', validUntil: at('2026-11-08') }, CATALOG)).toEqual({
            id: 'U1:portone',
            planId: 'pro-tier-02',
            status: 'trial',
            startedAt: '2026-11-01',
            billingDay: 8,
            provider: 'portone',
            trialEndsAt: '2026-11-08',
            nextBillingAt: '2026-11-08',
            nextAmount: { amount: 17200, currency: 'KRW' },
        });
    });

    it('reads a scheduled downgrade off an active subscription, charging the smaller plan next', () => {
        const sub = toSubscription(
            { ...base, status: 'active', validUntil: at('2026-12-01'), pendingProductId: 'dou-web-tier-01_dev' },
            CATALOG
        );
        expect(sub).toMatchObject({
            status: 'active',
            nextBillingAt: '2026-12-01',
            nextAmount: { amount: 8600 },
            pendingChange: { planId: 'pro-tier-01', effectiveAt: '2026-12-01' },
        });
    });

    it('reads cancelling as ending on the last day paid for, and an expiry as its day', () => {
        expect(toSubscription({ ...base, status: 'canceling', validUntil: at('2026-12-01') }, CATALOG)).toMatchObject({
            status: 'cancelScheduled',
            endsAt: '2026-12-01',
        });
        expect(toSubscription({ ...base, status: 'expired', validUntil: at('2026-12-01') }, CATALOG)).toMatchObject({
            status: 'expired',
            expiredAt: '2026-12-01',
        });
    });

    it('reads a payment still being confirmed as pending, with no dates to promise', () => {
        const sub = toSubscription({ ...base, status: 'pending', validUntil: 0 }, CATALOG);
        expect(sub).toMatchObject({ status: 'pending', startedAt: '2026-11-01' });
        expect(sub?.nextBillingAt).toBeUndefined();
    });

    it('takes the provider and the currency from the catalog it is read against', () => {
        const sub = toSubscription(
            { id: 'U1:stripe', productId: 'dou-web-stripe-tier-01_dev', status: 'trial', validUntil: at('2026-11-08') },
            toCatalog(STRIPE_PRODUCTS, 'stripe')
        );
        expect(sub).toMatchObject({ provider: 'stripe', nextAmount: { amount: 600, currency: 'USD' } });
    });

    it('has nothing for a product the screens do not sell', () => {
        expect(toSubscription({ ...base, productId: '#pro-tier-01', status: 'active' }, CATALOG)).toBeUndefined();
    });
});

describe('toPaymentMethod', () => {
    const today = new Date('2026-11-01T12:00:00');

    it('shows the issuer and the last four digits, and no expiry the server does not have', () => {
        expect(
            toPaymentMethod(
                {
                    id: 'k1',
                    provider: 'portone',
                    cardIssuer: 'SHINHAN',
                    cardNumber: '123412******5678',
                    isDefault: true,
                },
                today
            )
        ).toEqual({ id: 'k1', provider: 'portone', brand: 'SHINHAN', last4: '5678', isDefault: true });
    });

    it('carries the expiry where the provider reports one', () => {
        expect(
            toPaymentMethod(
                {
                    id: 'pm_1',
                    provider: 'stripe',
                    cardIssuer: 'visa',
                    cardNumber: '**** 4242',
                    cardExpMonth: 8,
                    cardExpYear: 2030,
                    isDefault: false,
                },
                today
            )
        ).toEqual({
            id: 'pm_1',
            provider: 'stripe',
            brand: 'visa',
            last4: '4242',
            expMonth: 8,
            expYear: 2030,
            expiringSoon: false,
            isDefault: false,
        });
    });

    it('reads a card from before providers were named as the won provider, and drops an unknown one', () => {
        expect(toPaymentMethod({ id: 'k1' }, today)?.provider).toBe('portone');
        expect(toPaymentMethod({ id: 'k2', provider: 'paypal' }, today)).toBeUndefined();
    });

    it('ignores an expiry that is not a month', () => {
        expect(toPaymentMethod({ id: 'k1', cardExpMonth: 13, cardExpYear: 2030 }, today)?.expMonth).toBeUndefined();
    });
});

describe('isExpiringSoon', () => {
    const today = new Date('2026-11-15T12:00:00');

    it('is this month or the next', () => {
        expect(isExpiringSoon(11, 2026, today)).toBe(true);
        expect(isExpiringSoon(12, 2026, today)).toBe(true);
        expect(isExpiringSoon(1, 2027, today)).toBe(false);
    });

    it('counts a card already past its month as expiring', () => {
        expect(isExpiringSoon(10, 2026, today)).toBe(true);
    });
});

describe('the account', () => {
    it('is billed by the store its live membership came from, with the plan held there', () => {
        const account = toAccount({
            user: { id: 'U1', email: 'minji.kim@gmail.com', name: 'Minji' },
            provider: 'google',
            membership: {
                platform: 'apple',
                status: 'active',
                productId: '#pro-tier-02',
                validUntil: at('2026-12-01'),
                trialUsed: true,
            },
        });
        expect(account).toEqual({
            id: 'U1',
            provider: 'google',
            email: 'minji.kim@gmail.com',
            displayName: 'Minji',
            billingSource: 'appStore',
            trialUsed: true,
            storeSubscription: { planId: 'pro-tier-02', nextBillingAt: '2026-12-01' },
        });
    });

    it('is billed by nobody once the membership lapsed, and by the web on the payment platform', () => {
        expect(billingSourceOf({ platform: 'google', status: 'expired' })).toBe('none');
        expect(billingSourceOf({ platform: 'portone', status: 'pending' })).toBe('web');
        expect(billingSourceOf(undefined)).toBe('none');
    });
});

describe('prorate', () => {
    it('charges the price difference for the part of the period left, rounded down to the won', () => {
        const from = { amount: 8600, currency: 'KRW' as const };
        const to = { amount: 17200, currency: 'KRW' as const };
        expect(prorate(from, to, 0, 30, 10)).toEqual({ amount: 5733, currency: 'KRW' });
        expect(prorate(from, to, 0, 30, 30)).toEqual({ amount: 0, currency: 'KRW' });
        expect(prorate(from, to, 0, 0, 0)).toEqual({ amount: 0, currency: 'KRW' });
    });
});

describe('payment attempts', () => {
    it('carries what it is about in its id, and reads it back', () => {
        const id = attemptId({ purpose: 'start', status: 'failed', withTrial: false });
        expect(parseAttemptId(id)).toEqual({
            id,
            purpose: 'start',
            status: 'failed',
            withTrial: false,
            failure: 'declined',
        });
        expect(parseAttemptId('att-1')).toBeUndefined();
    });

    it('settles from the subscription it produced', () => {
        const sub = toSubscription(
            { id: 'U1:portone', productId: 'dou-web-tier-01_dev', status: 'active', validUntil: at('2026-12-01') },
            CATALOG
        );
        expect(attemptFromSubscription({ purpose: 'start', withTrial: false }, sub)).toMatchObject({
            status: 'succeeded',
            subscriptionId: 'U1:portone',
        });
        expect(
            attemptFromSubscription({ purpose: 'start', withTrial: false }, sub && { ...sub, status: 'pending' })
        ).toMatchObject({ status: 'processing' });
        expect(attemptFromSubscription({ purpose: 'start', withTrial: false }, undefined)).toMatchObject({
            status: 'failed',
            failure: 'declined',
        });
    });
});
