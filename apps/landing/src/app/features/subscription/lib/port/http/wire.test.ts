import {
    attemptFromSubscription,
    attemptId,
    billingSourceOf,
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
const CATALOG = toCatalog(PRODUCTS);

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
            toCatalog([
                { id: 'x', sort: 6, price: 1 },
                { id: 'y', sort: 1 },
            ])
        ).toEqual([]);
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

    it('has nothing for a product the screens do not sell', () => {
        expect(toSubscription({ ...base, productId: '#pro-tier-01', status: 'active' }, CATALOG)).toBeUndefined();
    });
});

describe('toPaymentMethod', () => {
    it('shows the issuer and the last four digits, and no expiry the server does not have', () => {
        expect(
            toPaymentMethod({ id: 'k1', cardIssuer: 'SHINHAN', cardNumber: '123412******5678', isDefault: true })
        ).toEqual({ id: 'k1', brand: 'SHINHAN', last4: '5678', isDefault: true });
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
