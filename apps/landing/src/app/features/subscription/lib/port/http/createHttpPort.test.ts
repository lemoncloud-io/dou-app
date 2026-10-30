import { PLAN_CATALOG, planCatalogIn } from '../../catalog';
import { isPortError } from '../errors';
import { type HttpPortOptions, type SubscriptionApi, createHttpPort } from './createHttpPort';

import type { SubscriptionWire } from './wire';
import type { CardToken } from '../../../types';

/**
 * The port against the subscription server's contract: every response below is the shape that
 * server answers with (its `?mock` samples, which follow the same views). The server's calls are a
 * table of routes, each call standing for the request the runtime's repository makes, so each test
 * says what the server holds and reads what the port made of it.
 */
const PAYER = { name: '김민지', phone: '01012345678', email: 'minji.kim@gmail.com' };
const at = (iso: string) => new Date(`${iso}T12:00:00`).getTime();
const NOW = at('2026-11-10');

const PLANS = {
    total: 5,
    list: [1, 2, 3, 4, 5].map(sort => ({
        id: `#dou-web-tier-0${sort}_dev`,
        sort,
        maxClouds: sort,
        price: 8600 * sort,
        currency: 'KRW',
        trialDays: 7,
    })),
};

// The dollar products, priced in cents.
const STRIPE_PLANS = {
    total: 5,
    list: [1, 2, 3, 4, 5].map(sort => ({
        id: `dou-web-stripe-tier-0${sort}_dev`,
        platform: 'stripe',
        sort,
        maxClouds: sort,
        price: 600 * sort,
        currency: 'USD',
        trialDays: 7,
    })),
};

const ISSUE = {
    provider: 'portone',
    storeId: 'store-mock-0000',
    channelKey: 'channel-key-mock-0000',
    customerId: 'mock:dev:user-0000',
    issueId: 'issue-mock-0000',
    issueName: 'DoU 구독',
};

const CARD = {
    id: 'mock:dev:U1:01',
    provider: 'portone',
    status: 'active',
    cardIssuer: 'SHINHAN',
    cardNumber: '123412******5678',
    isDefault: true,
};

const httpError = (status: number, data = '') =>
    Object.assign(new Error(`status ${status}`), { response: { status, data } });
const DECLINED = '403 INVALID PAYMENT - card declined @start(subscriptions/0)';

type Route = (body: unknown) => unknown;

const setup = (routes: Record<string, Route | unknown>, options: Partial<HttpPortOptions> = {}) => {
    const calls: Array<{ method: string; path: string; params?: Record<string, unknown>; body?: unknown }> = [];
    const route = async <T>(method: string, path: string, body?: unknown, params?: Record<string, unknown>) => {
        calls.push({ method, path, params, body });
        const answer = routes[`${method} ${path}`];
        if (answer === undefined) throw httpError(404);
        // A GET has no body; its route reads the query instead.
        return (typeof answer === 'function' ? (answer as Route)(body ?? params) : answer) as T;
    };
    const api: SubscriptionApi = {
        fetchPlans: params => route('GET', '/products/0/plans', undefined, params),
        fetchMembershipInfo: () => route('GET', '/memberships/0/mine'),
        fetchMySubscription: () => route('GET', '/subscriptions/0/mine'),
        fetchSubscriptionCards: () => route('GET', '/subscriptions/0/cards'),
        issueBillingKey: productId => route('POST', '/subscriptions/0/issue', { productId }),
        startSubscription: body => route('POST', '/subscriptions/0/start', body),
        changeSubscription: productId => route('POST', '/subscriptions/0/change', { productId }),
        cancelSubscription: () => route('POST', '/subscriptions/0/cancel'),
        addCard: body => route('POST', '/subscriptions/0/card', body),
        setDefaultCard: billkeyId => route('POST', '/subscriptions/0/card-default', { billkeyId }),
        removeCard: billkeyId => route('POST', '/subscriptions/0/card-delete', { billkeyId }),
    };
    const store = new Map<string, string>();
    let user: Record<string, unknown> | null = { id: 'U1', email: 'minji.kim@gmail.com', name: 'Minji' };
    const exchange = vi.fn(async () => undefined);
    const signOut = vi.fn(async () => {
        user = null;
    });
    const paymentWindow = vi.fn(async () => ({ outcome: 'registered' as const, billingKey: 'billing-key-1' }));
    const port = createHttpPort({
        socialOauth: 'https://oauth2.example.com',
        origin: 'http://localhost:5004',
        api,
        session: { user: () => user, exchange, signOut },
        paymentWindow,
        storage: {
            getItem: key => store.get(key) ?? null,
            setItem: (key, value) => void store.set(key, value),
            removeItem: key => void store.delete(key),
        },
        now: () => NOW,
        nonce: () => 'n0nce',
        ...options,
    });
    return {
        port,
        calls,
        exchange,
        signOut,
        paymentWindow,
        signOutLocally: () => {
            user = null;
        },
    };
};

const BASE_ROUTES = {
    'GET /products/0/plans': (query: unknown) =>
        (query as { platform?: string })?.platform === 'stripe' ? STRIPE_PLANS : PLANS,
    'GET /memberships/0/mine': { platform: 'portone', status: 'expired', trialUsed: false },
    'GET /subscriptions/0/mine': {},
    'GET /subscriptions/0/cards': [CARD],
    'POST /subscriptions/0/issue': ISSUE,
};

const subscription = (wire: Partial<SubscriptionWire>): SubscriptionWire => ({
    id: 'U1:portone',
    platform: 'portone',
    productId: '#dou-web-tier-02_dev',
    validFrom: at('2026-11-01'),
    validUntil: at('2026-12-01'),
    autoRenewing: true,
    trialUsed: true,
    status: 'active',
    ...wire,
});

describe('createHttpPort — session', () => {
    it('has no session without a relay session, and reads the account and its membership with one', async () => {
        const { port, signOutLocally } = setup(BASE_ROUTES);
        expect(await port.getSession()).toMatchObject({
            id: 'U1',
            provider: 'google',
            email: 'minji.kim@gmail.com',
            billingSource: 'none',
            trialUsed: false,
        });
        signOutLocally();
        expect(await port.getSession()).toBeNull();
    });

    it('sends the reader to the OAuth relay and back to the callback with a nonce', async () => {
        const { port } = setup(BASE_ROUTES);
        expect(await port.startSignIn({ provider: 'google', next: '/subscription/history' })).toEqual({
            redirectUrl:
                'https://oauth2.example.com/oauth/google/authorize?redirect=http://localhost:5004/subscription/login/callback?state=n0nce',
        });
    });

    it('turns the returned code into a session and goes on to where the sign-in started', async () => {
        const { port, exchange } = setup(BASE_ROUTES);
        await port.startSignIn({ provider: 'google', next: '/subscription/history' });
        const result = await port.completeSignIn(new URLSearchParams('state=n0nce&code=code-123456&provider=google'));
        expect(exchange).toHaveBeenCalledWith('google', 'code-123456');
        expect(result).toMatchObject({ account: { id: 'U1' }, next: '/subscription/history' });
    });

    it('refuses a return it did not start, and a second exchange of the same one, keeping the way back', async () => {
        const { port, exchange } = setup(BASE_ROUTES);
        await port.startSignIn({ provider: 'google', next: '/subscription/history' });
        const wrong = await port.completeSignIn(new URLSearchParams('state=other&code=code-123456')).catch(e => e);
        expect(isPortError(wrong, 'signInExpired')).toBe(true);
        expect(wrong.detail).toEqual({ next: '/subscription/history' });
        const again = await port.completeSignIn(new URLSearchParams('state=n0nce&code=code-123456')).catch(e => e);
        expect(isPortError(again, 'signInExpired')).toBe(true);
        expect(exchange).not.toHaveBeenCalled();
    });

    it('reads a return without a code as a cancelled sign-in', async () => {
        const { port } = setup(BASE_ROUTES);
        await port.startSignIn({ provider: 'google' });
        const error = await port.completeSignIn(new URLSearchParams('state=n0nce&error=access_denied')).catch(e => e);
        expect(isPortError(error, 'signInCanceled')).toBe(true);
    });

    it('treats a session the server refuses as gone for the rest of the page', async () => {
        const { port } = setup({
            ...BASE_ROUTES,
            'GET /subscriptions/0/mine': () => {
                throw httpError(403);
            },
        });
        const error = await port.listSubscriptions().catch(e => e);
        expect(isPortError(error, 'unauthenticated')).toBe(true);
        expect(await port.getSession()).toBeNull();
    });
});

describe('createHttpPort — plans and subscription', () => {
    it('lists the published catalog to a visitor, since the server lists plans to a signed request only', async () => {
        const { port, signOutLocally, calls } = setup(BASE_ROUTES);
        signOutLocally();
        expect(await port.listPlans()).toEqual(PLAN_CATALOG);
        expect(await port.listPlans({ currency: 'USD' })).toEqual(planCatalogIn('USD'));
        expect(calls).toEqual([]);
    });

    it('lists the dollar plans from the dollar products when asked for dollars', async () => {
        const { port, calls } = setup(BASE_ROUTES);
        const plans = await port.listPlans({ currency: 'USD' });
        expect(plans[1]).toEqual({
            id: 'pro-tier-02',
            sort: 2,
            maxClouds: 2,
            monthly: { amount: 1200, currency: 'USD' },
            trialDays: 7,
        });
        expect(calls).toEqual([expect.objectContaining({ path: '/products/0/plans', params: { platform: 'stripe' } })]);
    });

    it('lists the plans in the currency of the subscription in force when none is asked for', async () => {
        const { port } = setup({
            ...BASE_ROUTES,
            'GET /subscriptions/0/mine': {
                subscription: subscription({
                    id: 'U1:stripe',
                    platform: 'stripe',
                    productId: 'dou-web-stripe-tier-02_dev',
                }),
            },
        });
        expect((await port.listPlans()).map(plan => plan.monthly.currency)).toEqual(Array(5).fill('USD'));
    });

    it('lists the web plans under the names the screens use once signed in', async () => {
        const { port, calls } = setup(BASE_ROUTES);
        const plans = await port.listPlans();
        expect(plans.map(plan => plan.id)).toEqual([
            'pro-tier-01',
            'pro-tier-02',
            'pro-tier-03',
            'pro-tier-04',
            'pro-tier-05',
        ]);
        expect(plans[0]).not.toHaveProperty('productId');
        expect(plans[0]).not.toHaveProperty('provider');
        expect(calls.find(call => call.path === '/products/0/plans')).toMatchObject({
            params: { platform: 'portone' },
        });
    });

    it('has one subscription at most, charged to its card', async () => {
        const { port } = setup({
            ...BASE_ROUTES,
            'GET /subscriptions/0/mine': { subscription: subscription({}) },
        });
        expect(await port.listSubscriptions()).toMatchObject([
            { id: 'U1:portone', planId: 'pro-tier-02', status: 'active', defaultPaymentMethodId: 'mock:dev:U1:01' },
        ]);
        expect(await port.getSubscription('U1:portone')).toMatchObject({ id: 'U1:portone' });
        expect(isPortError(await port.getSubscription('other').catch(e => e), 'notFound')).toBe(true);
        expect(await setup(BASE_ROUTES).port.listSubscriptions()).toEqual([]);
    });

    it('offers the trial to an account that never used one, and charges at once otherwise', async () => {
        const fresh = await setup(BASE_ROUTES).port.previewCheckout('pro-tier-01');
        expect(fresh).toMatchObject({
            withTrial: true,
            amountToday: { amount: 0 },
            trialEndsAt: '2026-11-17',
            firstChargeAt: '2026-11-17',
        });
        const used = await setup({
            ...BASE_ROUTES,
            'GET /memberships/0/mine': { platform: 'portone', status: 'expired', trialUsed: true },
        }).port.previewCheckout('pro-tier-01');
        expect(used).toMatchObject({ withTrial: false, amountToday: { amount: 8600 }, firstChargeAt: '2026-11-10' });
    });
});

describe('createHttpPort — checkout', () => {
    it('opens the window for the plan, then starts the subscription with the card and the payer', async () => {
        const start = vi.fn(() =>
            subscription({ status: 'trial', productId: '#dou-web-tier-01_dev', validUntil: at('2026-11-17') })
        );
        const { port, paymentWindow, calls } = setup({ ...BASE_ROUTES, 'POST /subscriptions/0/start': start });

        const registered = await port.startPaymentMethodRegistration({
            purpose: 'start',
            planId: 'pro-tier-01',
            payer: PAYER,
        });
        expect(registered).toEqual({ outcome: 'registered', card: 'billing-key-1' });
        expect(calls.find(call => call.path === '/subscriptions/0/issue')?.body).toEqual({
            productId: 'dou-web-tier-01_dev',
        });
        expect(paymentWindow).toHaveBeenCalledWith({
            issue: ISSUE,
            payer: PAYER,
            purpose: 'start',
            planId: 'pro-tier-01',
            redirectUrl: 'http://localhost:5004/subscription/checkout/payment?plan=pro-tier-01',
        });
        // A checkout's card goes with the start, not on its own.
        expect(calls.some(call => call.path === '/subscriptions/0/card')).toBe(false);

        const attempt = await port.startCheckout({
            planId: 'pro-tier-01',
            country: 'KR',
            emailId: 'em-1',
            payer: PAYER,
            card: 'billing-key-1' as CardToken,
        });
        expect(start).toHaveBeenCalledWith({ productId: 'dou-web-tier-01_dev', billingKey: 'billing-key-1', ...PAYER });
        expect(attempt).toMatchObject({
            purpose: 'start',
            status: 'succeeded',
            withTrial: true,
            subscriptionId: 'U1:portone',
        });
        expect(await port.getPaymentAttempt(attempt.id)).toMatchObject({ status: 'succeeded' });
    });

    it('sends a card added on its own back to the card list', async () => {
        const { port, paymentWindow } = setup({
            ...BASE_ROUTES,
            'GET /subscriptions/0/mine': { subscription: subscription({}) },
            'POST /subscriptions/0/card': () => CARD,
        });
        await port.startPaymentMethodRegistration({ purpose: 'addCard', payer: PAYER });
        expect(paymentWindow).toHaveBeenCalledWith(
            expect.objectContaining({ redirectUrl: 'http://localhost:5004/subscription/payment-methods' })
        );
    });

    it('reads the card of a window that came back through the address, and starts nothing', async () => {
        const { port, calls } = setup(BASE_ROUTES);
        expect(
            await port.completePaymentMethodRegistration({
                callback: new URLSearchParams('plan=pro-tier-01&billingKey=billing-key-9'),
                purpose: 'start',
                payer: PAYER,
            })
        ).toEqual({ outcome: 'registered', card: 'billing-key-9' });
        expect(calls.some(call => call.path === '/subscriptions/0/card')).toBe(false);
    });

    it('puts a card that came back through the address on the subscription when it was added on its own', async () => {
        const card = vi.fn(() => CARD);
        const { port } = setup({
            ...BASE_ROUTES,
            'GET /subscriptions/0/mine': { subscription: subscription({}) },
            'POST /subscriptions/0/card': card,
        });
        expect(
            await port.completePaymentMethodRegistration({
                callback: new URLSearchParams('billingKey=billing-key-9'),
                purpose: 'addCard',
                payer: PAYER,
            })
        ).toMatchObject({ outcome: 'registered' });
        expect(card).toHaveBeenCalledWith({ billingKey: 'billing-key-9', ...PAYER });
    });

    it('reads a window closed on its way back as cancelled, and a refusal as failed', async () => {
        const { port } = setup(BASE_ROUTES);
        const back = (query: string) =>
            port.completePaymentMethodRegistration({
                callback: new URLSearchParams(query),
                purpose: 'start',
                payer: PAYER,
            });
        expect(
            await back(
                'code=FAILURE_TYPE_PG&message=%EB%B9%8C%EB%A7%81%ED%82%A4%20%EB%B0%9C%EA%B8%89%EC%9D%84%20%EC%B7%A8%EC%86%8C'
            )
        ).toEqual({
            outcome: 'closed',
        });
        expect(await back('code=FAILURE_TYPE_PG&message=declined')).toMatchObject({ outcome: 'failed' });
    });

    it('refuses a return that carries no result from the window', async () => {
        const { port } = setup(BASE_ROUTES);
        await expect(
            port.completePaymentMethodRegistration({
                callback: new URLSearchParams('plan=pro-tier-01'),
                purpose: 'start',
                payer: PAYER,
            })
        ).rejects.toMatchObject({ code: 'conflict' });
    });

    it('ends without a start when the window does', async () => {
        const { port, paymentWindow, calls } = setup(BASE_ROUTES);
        paymentWindow.mockResolvedValueOnce({ outcome: 'closed' } as never);
        expect(
            await port.startPaymentMethodRegistration({ purpose: 'start', planId: 'pro-tier-01', payer: PAYER })
        ).toEqual({ outcome: 'closed' });
        expect(calls.some(call => call.path === '/subscriptions/0/start')).toBe(false);
    });

    it('reads a declined first charge as a failed attempt', async () => {
        const { port } = setup({
            ...BASE_ROUTES,
            'POST /subscriptions/0/start': () => {
                throw httpError(403, DECLINED);
            },
        });
        const attempt = await port.startCheckout({
            planId: 'pro-tier-01',
            country: 'KR',
            emailId: 'em-1',
            payer: PAYER,
        });
        expect(attempt).toMatchObject({ status: 'failed', failure: 'declined' });
        expect(await port.getSession()).not.toBeNull();
    });

    it('follows a payment the server is still confirming until the subscription settles', async () => {
        let held = subscription({ status: 'pending', productId: '#dou-web-tier-01_dev', validUntil: 0 });
        const { port } = setup({
            ...BASE_ROUTES,
            'POST /subscriptions/0/start': () => held,
            'GET /subscriptions/0/mine': () => ({ subscription: held }),
        });
        const attempt = await port.startCheckout({
            planId: 'pro-tier-01',
            country: 'KR',
            emailId: 'em-1',
            payer: PAYER,
        });
        expect(attempt.status).toBe('processing');
        expect((await port.getPaymentAttempt(attempt.id)).status).toBe('processing');
        held = { ...held, status: 'active', validUntil: at('2026-12-10') };
        expect(await port.getPaymentAttempt(attempt.id)).toMatchObject({
            status: 'succeeded',
            subscriptionId: 'U1:portone',
        });
    });

    it('reads any other 403 on a charge as the session refused, not the card', async () => {
        const { port } = setup({
            ...BASE_ROUTES,
            'POST /subscriptions/0/start': () => {
                throw httpError(403, '403 NOT ALLOWED - main user only @doPostStart(subscriptions/0)');
            },
        });
        const error = await port
            .startCheckout({ planId: 'pro-tier-01', country: 'KR', emailId: 'em-1', payer: PAYER })
            .catch(e => e);
        expect(isPortError(error, 'unauthenticated')).toBe(true);
        expect(await port.getSession()).toBeNull();
    });

    it('follows a start answered with a subscription it could not read, instead of failing it', async () => {
        const { port } = setup({
            ...BASE_ROUTES,
            'POST /subscriptions/0/start': subscription({ productId: '#unknown' }),
        });
        const attempt = await port.startCheckout({
            planId: 'pro-tier-01',
            country: 'KR',
            emailId: 'em-1',
            payer: PAYER,
        });
        expect(attempt.status).toBe('processing');
    });

    it('refuses a second subscription as the conflict it is', async () => {
        const { port } = setup({
            ...BASE_ROUTES,
            'POST /subscriptions/0/start': () => {
                throw httpError(409);
            },
        });
        const error = await port
            .startCheckout({ planId: 'pro-tier-01', country: 'KR', emailId: 'em-1', payer: PAYER })
            .catch(e => e);
        expect(isPortError(error, 'conflict')).toBe(true);
    });
});

describe('createHttpPort — plan change and cancelling', () => {
    const ACTIVE = { ...BASE_ROUTES, 'GET /subscriptions/0/mine': { subscription: subscription({}) } };

    it('estimates an upgrade as the difference for the days left, and charges it', async () => {
        const change = vi.fn(() => subscription({ productId: '#dou-web-tier-03_dev' }));
        const { port } = setup({ ...ACTIVE, 'POST /subscriptions/0/change': change });
        const preview = await port.previewChange('pro-tier-03');
        // 8,600 more a month, 21 of 30 days left.
        expect(preview).toMatchObject({
            kind: 'upgrade',
            effectiveAt: '2026-11-10',
            amountToday: { amount: 6020 },
            nextAmount: { amount: 25800 },
        });
        expect(await port.changePlan('pro-tier-03')).toMatchObject({ purpose: 'upgrade', status: 'succeeded' });
        expect(change).toHaveBeenCalledWith({ productId: 'dou-web-tier-03_dev' });
    });

    it('schedules a downgrade for the next charge, and blocks a jump of two tiers', async () => {
        const { port } = setup({
            ...ACTIVE,
            'POST /subscriptions/0/change': subscription({ pendingProductId: 'dou-web-tier-01_dev' }),
        });
        expect(await port.changePlan('pro-tier-01')).toEqual({ scheduled: true, effectiveAt: '2026-12-01' });
        expect(await port.previewChange('pro-tier-04')).toMatchObject({ kind: 'upgrade', blocked: 'notAdjacent' });
        expect(isPortError(await port.changePlan('pro-tier-04').catch(e => e), 'conflict')).toBe(true);
    });

    it('reads a declined difference as a failed upgrade', async () => {
        const { port } = setup({
            ...ACTIVE,
            'POST /subscriptions/0/change': () => {
                throw httpError(403, DECLINED);
            },
        });
        expect(await port.changePlan('pro-tier-03')).toMatchObject({ purpose: 'upgrade', status: 'failed' });
    });

    it('refuses an upgrade during a trial, as the server does, but lets a trial move down', async () => {
        const { port } = setup({
            ...BASE_ROUTES,
            'GET /subscriptions/0/mine': { subscription: subscription({ status: 'trial' }) },
        });
        expect(await port.previewChange('pro-tier-03')).toMatchObject({ kind: 'upgrade', blocked: 'trialUpgrade' });
        expect(isPortError(await port.changePlan('pro-tier-03').catch(e => e), 'conflict')).toBe(true);
        const down = await port.previewChange('pro-tier-01');
        expect(down).toMatchObject({ kind: 'downgrade' });
        expect(down.blocked).toBeUndefined();
    });

    it('cancels into a subscription that ends on its last paid day', async () => {
        const { port } = setup({
            ...ACTIVE,
            'POST /subscriptions/0/cancel': subscription({ status: 'canceling', autoRenewing: false }),
        });
        expect(await port.cancelSubscription('U1:portone')).toMatchObject({
            status: 'cancelScheduled',
            endsAt: '2026-12-01',
        });
    });
});

describe('createHttpPort — cards', () => {
    it('lists the card the subscription is charged to', async () => {
        expect(await setup(BASE_ROUTES).port.listPaymentMethods()).toEqual([
            { id: 'mock:dev:U1:01', provider: 'portone', brand: 'SHINHAN', last4: '5678', isDefault: true },
        ]);
    });

    // The card list carries every provider's cards, and each provider marks a default of its own.
    const DOLLAR_CARD = {
        id: 'pm_1',
        provider: 'stripe',
        cardIssuer: 'visa',
        cardNumber: '**** 4242',
        cardExpMonth: 8,
        cardExpYear: 2030,
        isDefault: true,
    };

    it("puts beside a subscription the default card of its own provider, not the other provider's", async () => {
        const won = setup({
            ...BASE_ROUTES,
            'GET /subscriptions/0/mine': { subscription: subscription({}) },
            'GET /subscriptions/0/cards': [DOLLAR_CARD, CARD],
        });
        expect((await won.port.listSubscriptions())[0].defaultPaymentMethodId).toBe(CARD.id);

        const dollars = setup({
            ...BASE_ROUTES,
            'GET /subscriptions/0/mine': {
                subscription: subscription({
                    id: 'U1:stripe',
                    platform: 'stripe',
                    productId: 'dou-web-stripe-tier-02_dev',
                }),
            },
            'GET /subscriptions/0/cards': [CARD, DOLLAR_CARD],
        });
        expect((await dollars.port.listSubscriptions())[0]).toMatchObject({
            provider: 'stripe',
            defaultPaymentMethodId: 'pm_1',
            nextAmount: { amount: 1200, currency: 'USD' },
        });
    });

    it("lists every provider's cards, each with its own default and the expiry where there is one", async () => {
        const { port } = setup({ ...BASE_ROUTES, 'GET /subscriptions/0/cards': [CARD, DOLLAR_CARD] });
        expect(await port.listPaymentMethods()).toEqual([
            { id: 'mock:dev:U1:01', provider: 'portone', brand: 'SHINHAN', last4: '5678', isDefault: true },
            {
                id: 'pm_1',
                provider: 'stripe',
                brand: 'visa',
                last4: '4242',
                expMonth: 8,
                expYear: 2030,
                expiringSoon: false,
                isDefault: true,
            },
        ]);
    });

    it('adds a card on its own with the payer', async () => {
        const card = vi.fn(() => CARD);
        const { port, calls } = setup({
            ...BASE_ROUTES,
            'GET /subscriptions/0/mine': { subscription: subscription({}) },
            'POST /subscriptions/0/card': card,
        });
        expect(await port.startPaymentMethodRegistration({ purpose: 'addCard', payer: PAYER })).toMatchObject({
            outcome: 'registered',
        });
        expect(calls.find(call => call.path === '/subscriptions/0/issue')?.body).toEqual({
            productId: 'dou-web-tier-02_dev',
        });
        expect(card).toHaveBeenCalledWith({ billingKey: 'billing-key-1', ...PAYER });
    });

    const SECOND = {
        ...CARD,
        id: 'mock:dev:U1:02',
        cardIssuer: 'HANA',
        cardNumber: '532750******9999',
        isDefault: false,
    };

    it('removes the card it is given by its id and answers with what is left', async () => {
        let cards = [CARD, SECOND];
        const remove = vi.fn((body: unknown) => {
            cards = cards.filter(card => card.id !== (body as { billkeyId: string }).billkeyId);
            return SECOND;
        });
        const { port } = setup({
            ...BASE_ROUTES,
            'GET /subscriptions/0/cards': () => cards,
            'POST /subscriptions/0/card-delete': remove,
        });
        expect(await port.removePaymentMethod(SECOND.id)).toEqual([
            { id: 'mock:dev:U1:01', provider: 'portone', brand: 'SHINHAN', last4: '5678', isDefault: true },
        ]);
        expect(remove).toHaveBeenCalledWith({ billkeyId: SECOND.id });
    });

    it('makes the card it is given the default and answers with the list as the server now holds it', async () => {
        let cards = [CARD, SECOND];
        const setDefault = vi.fn((body: unknown) => {
            const id = (body as { billkeyId: string }).billkeyId;
            cards = cards.map(card => ({ ...card, isDefault: card.id === id }));
            return cards.find(card => card.id === id);
        });
        const { port } = setup({
            ...BASE_ROUTES,
            'GET /subscriptions/0/cards': () => cards,
            'POST /subscriptions/0/card-default': setDefault,
        });
        expect(await port.setDefaultPaymentMethod(SECOND.id)).toEqual([
            { id: 'mock:dev:U1:01', provider: 'portone', brand: 'SHINHAN', last4: '5678', isDefault: false },
            { id: 'mock:dev:U1:02', provider: 'portone', brand: 'HANA', last4: '9999', isDefault: true },
        ]);
        expect(setDefault).toHaveBeenCalledWith({ billkeyId: SECOND.id });
    });

    it('reports a card the server will not remove while it is in use as a conflict', async () => {
        const { port } = setup({
            ...BASE_ROUTES,
            'POST /subscriptions/0/card-delete': () => {
                throw httpError(409);
            },
        });
        expect(isPortError(await port.removePaymentMethod(CARD.id).catch(e => e), 'conflict')).toBe(true);
    });
});
