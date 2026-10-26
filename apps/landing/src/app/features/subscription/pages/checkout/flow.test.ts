import { MOCK_PLANS } from '../../lib/mock/policy';
import {
    DOWNGRADE_COMPLETE_URL,
    NO_CONSENTS,
    attemptVariantOf,
    canContinueCheckout,
    chargedToday,
    checkoutDetailsOf,
    checkoutRouteFor,
    completeSceneOf,
    completeUrl,
    dayBefore,
    formatShortDate,
    isEmailShaped,
    planFromQuery,
    registrationOutcomeUrl,
    registrationSceneOf,
    retryUrlOf,
    setAllConsents,
    statusSceneOf,
    statusUrl,
} from './flow';

import type { Account, Invoice, PaymentAttempt } from '../../types';

const [cloud1, cloud2, cloud3] = MOCK_PLANS;

const account = (overrides: Partial<Account> = {}): Account => ({
    id: 'acc-1',
    provider: 'google',
    billingSource: 'none',
    trialUsed: false,
    ...overrides,
});

const attempt = (overrides: Partial<PaymentAttempt>): PaymentAttempt => ({
    id: 'att-1',
    purpose: 'start',
    status: 'processing',
    ...overrides,
});

describe('planFromQuery', () => {
    it('finds the plan a query names', () => {
        expect(planFromQuery(MOCK_PLANS, 'pro-tier-02')).toBe(cloud2);
    });

    it('ignores a missing or unknown plan, and plans not loaded yet', () => {
        expect(planFromQuery(MOCK_PLANS, null)).toBeUndefined();
        expect(planFromQuery(MOCK_PLANS, 'cloud-2')).toBeUndefined();
        expect(planFromQuery(undefined, 'pro-tier-02')).toBeUndefined();
    });
});

describe('checkout readiness', () => {
    const allIn = setAllConsents(true);

    it('continues with Korea, a verified email and every consent', () => {
        expect(canContinueCheckout({ country: 'KR', emailId: 'em-1', consents: allIn })).toBe(true);
    });

    it('stops for a country outside Korea, even with everything else done', () => {
        expect(canContinueCheckout({ country: 'US', emailId: 'em-1', consents: allIn })).toBe(false);
    });

    it('stops without a verified email or with any consent missing', () => {
        expect(canContinueCheckout({ country: 'KR', consents: allIn })).toBe(false);
        expect(canContinueCheckout({ country: 'KR', emailId: 'em-1', consents: { ...allIn, autoRenew: false } })).toBe(
            false
        );
        expect(canContinueCheckout({ country: 'KR', emailId: 'em-1', consents: NO_CONSENTS })).toBe(false);
    });

    it('takes an address-shaped email only', () => {
        expect(isEmailShaped(' billing@lemon.example ')).toBe(true);
        expect(isEmailShaped('billing@lemon')).toBe(false);
        expect(isEmailShaped('')).toBe(false);
    });
});

describe('checkoutRouteFor', () => {
    it('keeps a first subscription to the entry plan on checkout', () => {
        expect(checkoutRouteFor(undefined, cloud1, account())).toBe('checkout');
    });

    it('sends a subscriber to the plan change instead', () => {
        expect(checkoutRouteFor(cloud2, cloud3, account({ billingSource: 'web' }))).toBe('change');
        expect(checkoutRouteFor(cloud2, cloud1, account({ billingSource: 'web' }))).toBe('change');
    });

    it('sends a plan that cannot be picked back to the plans', () => {
        expect(checkoutRouteFor(undefined, cloud2, account())).toBe('plans');
        expect(checkoutRouteFor(cloud2, cloud2, account())).toBe('plans');
        expect(checkoutRouteFor(undefined, cloud1, account({ billingSource: 'appStore' }))).toBe('plans');
    });
});

describe('checkoutDetailsOf', () => {
    it('reads what W-08 put in the navigation state', () => {
        expect(checkoutDetailsOf({ checkout: { country: 'KR', emailId: 'em-1' } })).toEqual({
            country: 'KR',
            emailId: 'em-1',
        });
    });

    it('has nothing for a page reached without W-08', () => {
        expect(checkoutDetailsOf(null)).toBeUndefined();
        expect(checkoutDetailsOf({ checkout: { country: 'KR' } })).toBeUndefined();
    });
});

describe('URLs', () => {
    it('names the attempt and, when known, the plan', () => {
        expect(statusUrl('att-1', 'pro-tier-01')).toBe('/subscription/checkout/status?attempt=att-1&plan=pro-tier-01');
        expect(statusUrl('att-1')).toBe('/subscription/checkout/status?attempt=att-1');
        expect(completeUrl('att-1', 'pro-tier-03')).toBe(
            '/subscription/checkout/complete?attempt=att-1&plan=pro-tier-03'
        );
    });

    it('tells W-09 how a window without an attempt ended', () => {
        expect(registrationOutcomeUrl('pro-tier-01', 'closed')).toBe(
            '/subscription/checkout/status?plan=pro-tier-01&outcome=closed'
        );
        expect(DOWNGRADE_COMPLETE_URL).toBe('/subscription/checkout/complete?change=downgrade');
    });
});

describe('W-09 scenes', () => {
    it('picks the copy from the purpose, and from the trial for a first subscription', () => {
        expect(attemptVariantOf('start', true)).toBe('card');
        expect(attemptVariantOf('start', false)).toBe('payment');
        expect(attemptVariantOf('upgrade', undefined)).toBe('upgrade');
        expect(attemptVariantOf('retry', undefined)).toBe('retry');
    });

    it('follows a processing attempt, and names a failure', () => {
        expect(statusSceneOf(attempt({ withTrial: true }))).toEqual({ kind: 'processing', variant: 'card' });
        expect(statusSceneOf(attempt({ purpose: 'upgrade', status: 'failed', failure: 'declined' }))).toEqual({
            kind: 'failed',
            variant: 'upgrade',
            failure: 'declined',
        });
        expect(statusSceneOf(attempt({ status: 'failed' }))).toEqual({
            kind: 'failed',
            variant: 'payment',
            failure: 'unknown',
        });
        expect(statusSceneOf(attempt({ status: 'canceled', withTrial: false }))).toEqual({
            kind: 'canceled',
            variant: 'payment',
        });
    });

    it('moves a successful checkout or upgrade on, and keeps a successful retry here', () => {
        expect(statusSceneOf(attempt({ status: 'succeeded' }))).toEqual({ kind: 'complete' });
        expect(statusSceneOf(attempt({ purpose: 'upgrade', status: 'succeeded' }))).toEqual({ kind: 'complete' });
        expect(statusSceneOf(attempt({ purpose: 'retry', status: 'succeeded' }))).toEqual({ kind: 'retried' });
    });

    it('sends a card added on its own back to the payment methods, not round to W-06', () => {
        expect(statusSceneOf(attempt({ purpose: 'addCard', status: 'succeeded' }))).toEqual({ kind: 'cardAdded' });
    });

    it('reads a payment window that ended without an attempt', () => {
        expect(registrationSceneOf('failed', false)).toEqual({ kind: 'failed', variant: 'card', failure: 'declined' });
        expect(registrationSceneOf('closed', true)).toEqual({ kind: 'canceled', variant: 'card' });
        expect(registrationSceneOf('closed', false)).toEqual({ kind: 'canceled', variant: 'payment' });
        expect(registrationSceneOf('registered', false)).toBeUndefined();
        expect(registrationSceneOf(null, false)).toBeUndefined();
    });

    it('sends "try again" back to where the attempt started', () => {
        expect(retryUrlOf('card', 'pro-tier-01')).toBe('/subscription/checkout/payment?plan=pro-tier-01');
        expect(retryUrlOf('payment', undefined)).toBe('/subscription/plans');
        expect(retryUrlOf('upgrade', 'pro-tier-03')).toBe('/subscription/change?plan=pro-tier-03');
        expect(retryUrlOf('upgrade', undefined)).toBe('/subscription');
        expect(retryUrlOf('retry', undefined)).toBe('/subscription/payment-methods');
    });
});

describe('W-06 scenes', () => {
    it('tells a trial from a first payment, and an upgrade', () => {
        expect(completeSceneOf(attempt({ status: 'succeeded', withTrial: true }))).toBe('trialStarted');
        expect(completeSceneOf(attempt({ status: 'succeeded', withTrial: false }))).toBe('firstPayment');
        expect(completeSceneOf(attempt({ purpose: 'upgrade', status: 'succeeded' }))).toBe('upgraded');
    });

    it('has nothing to show for an attempt that has not gone through, or a retry', () => {
        expect(completeSceneOf(attempt({ status: 'processing' }))).toBeUndefined();
        expect(completeSceneOf(attempt({ status: 'failed' }))).toBeUndefined();
        expect(completeSceneOf(attempt({ purpose: 'retry', status: 'succeeded' }))).toBeUndefined();
    });

    it("finds today's charge for the plan in the invoices", () => {
        const invoice = (overrides: Partial<Invoice>): Invoice => ({
            id: 'inv-1',
            issuedAt: '2026-11-01',
            kind: 'upgrade',
            planId: 'pro-tier-03',
            amount: { amount: 5730, currency: 'KRW' },
            status: 'paid',
            ...overrides,
        });
        const invoices = [
            invoice({ id: 'inv-3', issuedAt: '2026-10-20' }),
            invoice({ id: 'inv-2', status: 'failed' }),
            invoice({ id: 'inv-1' }),
        ];
        expect(chargedToday(invoices, 'upgrade', 'pro-tier-03', '2026-11-01')?.id).toBe('inv-1');
        expect(chargedToday(invoices, 'upgrade', 'pro-tier-02', '2026-11-01')).toBeUndefined();
        expect(chargedToday(invoices, 'first', 'pro-tier-03', '2026-11-01')).toBeUndefined();
        expect(chargedToday(undefined, 'upgrade', 'pro-tier-03', '2026-11-01')).toBeUndefined();
    });
});

describe('dates', () => {
    it('gives the last day before a charge or a change, across a month end', () => {
        expect(dayBefore('2026-11-08')).toBe('2026-11-07');
        expect(dayBefore('2026-12-01')).toBe('2026-11-30');
    });

    it('prints the short month-day form', () => {
        expect(formatShortDate('2026-11-08')).toBe('11.08');
    });
});
