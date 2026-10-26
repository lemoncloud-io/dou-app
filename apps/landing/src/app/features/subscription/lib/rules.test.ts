import { addDays, addMonths, toIsoDate } from './calendar';
import { canRemovePaymentMethod } from './canRemovePaymentMethod';
import { changeKindOf } from './changeKindOf';
import { ddayOf } from './ddayOf';
import { landingAfterSignIn, safeNext } from './safeNext';
import { sceneOf } from './sceneOf';

import type { Account, PaymentMethod, Plan, Subscription } from '../types';

const plan = (sort: Plan['sort']): Plan => ({
    id: `pro-tier-0${sort}` as Plan['id'],
    sort,
    maxClouds: sort,
    monthly: { amount: 8600 * sort, currency: 'KRW' },
    trialDays: 7,
});

const account = (overrides: Partial<Account> = {}): Account => ({
    id: 'acc-1',
    provider: 'google',
    email: 'minji.kim@gmail.com',
    billingSource: 'web',
    trialUsed: true,
    ...overrides,
});

const sub = (overrides: Partial<Subscription> = {}): Subscription => ({
    id: 'sub-1',
    planId: 'pro-tier-02',
    status: 'active',
    startedAt: '2026-08-20',
    billingDay: 20,
    nextBillingAt: '2026-12-20',
    nextAmount: { amount: 17200, currency: 'KRW' },
    ...overrides,
});

const card = (id: string, isDefault = false): PaymentMethod => ({
    id,
    brand: 'Shinhan',
    last4: '1234',
    expMonth: 4,
    expYear: 2029,
    isDefault,
    expiringSoon: false,
});

// Local noon, so the calendar day is the same in every time zone the tests may run in.
const at = (iso: string) => new Date(`${iso}T12:00:00`);

describe('calendar', () => {
    it('reads the local calendar day', () => {
        expect(toIsoDate(at('2026-11-20'))).toBe('2026-11-20');
    });

    it('adds days across a month end', () => {
        expect(addDays('2026-11-28', 5)).toBe('2026-12-03');
        expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    });

    it('holds the billing day to the last day of a shorter month', () => {
        expect(addMonths('2026-10-31', 1)).toBe('2026-11-30');
        expect(addMonths('2026-11-30', 1, 31)).toBe('2026-12-31');
        expect(addMonths('2026-12-20', 1)).toBe('2027-01-20');
    });
});

describe('ddayOf', () => {
    it('is 0 on the day, positive before it and negative after', () => {
        expect(ddayOf('2026-11-20', at('2026-11-20'))).toBe(0);
        expect(ddayOf('2026-11-25', at('2026-11-20'))).toBe(5);
        expect(ddayOf('2026-11-18', at('2026-11-20'))).toBe(-2);
    });

    it('counts calendar days, not 24-hour spans', () => {
        expect(ddayOf('2026-11-21', new Date('2026-11-20T23:59:00'))).toBe(1);
    });
});

describe('sceneOf', () => {
    const now = at('2026-11-20');

    it('shows the trial end and the first charge on a trial', () => {
        const scene = sceneOf(sub({ status: 'trial', trialEndsAt: '2026-11-27', nextBillingAt: '2026-11-27' }), now);
        expect(scene).toEqual({
            banner: {
                kind: 'trial',
                date: '2026-11-27',
                chargeAt: '2026-11-27',
                amount: { amount: 17200, currency: 'KRW' },
            },
            actions: ['changePlan', 'cancel'],
        });
    });

    it('shows the next charge and every action on an active subscription', () => {
        expect(sceneOf(sub(), now)).toEqual({
            banner: { kind: 'active', date: '2026-12-20', amount: { amount: 17200, currency: 'KRW' } },
            actions: ['changePlan', 'paymentMethods', 'invoices', 'cancel'],
        });
    });

    it('counts down to the restriction when a payment failed', () => {
        const scene = sceneOf(sub({ status: 'pastDue', failedAt: '2026-11-18', restrictAt: '2026-11-25' }), now);
        expect(scene.banner).toEqual({ kind: 'pastDue', date: '2026-11-25', dday: 5 });
        expect(scene.actions).toEqual(['updatePaymentMethod']);
    });

    it('sends a restricted subscription to its payment method', () => {
        expect(sceneOf(sub({ status: 'restricted', restrictAt: '2026-11-18' }), now)).toEqual({
            banner: { kind: 'restricted', date: '2026-11-18' },
            actions: ['updatePaymentMethod'],
        });
    });

    it('counts down to the end and offers resuming when cancellation is scheduled', () => {
        expect(sceneOf(sub({ status: 'cancelScheduled', endsAt: '2026-12-20' }), now)).toEqual({
            banner: { kind: 'cancelScheduled', date: '2026-12-20', dday: 30 },
            actions: ['resume'],
        });
    });

    it('shows a scheduled downgrade over the active banner', () => {
        const scene = sceneOf(sub({ pendingChange: { planId: 'pro-tier-01', effectiveAt: '2026-12-20' } }), now);
        expect(scene.banner).toEqual({
            kind: 'downgradeScheduled',
            planId: 'pro-tier-01',
            date: '2026-12-20',
            amount: { amount: 17200, currency: 'KRW' },
        });
        expect(scene.actions).toEqual(['cancelScheduledChange', 'chooseClouds']);
    });

    it('offers subscribing again once expired', () => {
        expect(sceneOf(sub({ status: 'expired', expiredAt: '2026-09-19' }), now)).toEqual({
            banner: { kind: 'expired', date: '2026-09-19' },
            actions: ['resubscribe'],
        });
    });

    it('announces a restore and keeps the ordinary actions', () => {
        expect(sceneOf(sub({ restored: true }), now)).toEqual({
            banner: { kind: 'restored' },
            actions: ['changePlan', 'paymentMethods', 'invoices', 'cancel'],
        });
    });
});

describe('changeKindOf', () => {
    it('sells only the entry plan with no subscription in force', () => {
        expect(changeKindOf(undefined, plan(1), account())).toBe('new');
        expect(changeKindOf(undefined, plan(2), account())).toBe('blocked');
        expect(changeKindOf(undefined, plan(1), null)).toBe('new');
    });

    it('allows one step up or down from the plan in force', () => {
        expect(changeKindOf(plan(2), plan(2), account())).toBe('current');
        expect(changeKindOf(plan(2), plan(3), account())).toBe('upgrade');
        expect(changeKindOf(plan(2), plan(1), account())).toBe('downgrade');
        expect(changeKindOf(plan(2), plan(4), account())).toBe('blocked');
        expect(changeKindOf(plan(5), plan(3), account())).toBe('blocked');
    });

    it('blocks every plan for a store subscriber', () => {
        expect(changeKindOf(undefined, plan(1), account({ billingSource: 'appStore' }))).toBe('blocked');
        expect(changeKindOf(plan(2), plan(3), account({ billingSource: 'googlePlay' }))).toBe('blocked');
    });
});

describe('canRemovePaymentMethod', () => {
    const live = sub();

    it('refuses the last card of a live subscription', () => {
        expect(canRemovePaymentMethod(card('a', true), [card('a', true)], live)).toBe('last');
    });

    it('refuses the default card while others exist', () => {
        const methods = [card('a', true), card('b')];
        expect(canRemovePaymentMethod(methods[0], methods, live)).toBe('default');
        expect(canRemovePaymentMethod(methods[1], methods, live)).toBe('ok');
    });

    it('allows any card with nothing to charge', () => {
        expect(canRemovePaymentMethod(card('a', true), [card('a', true)], undefined)).toBe('ok');
        expect(canRemovePaymentMethod(card('a', true), [card('a', true)], sub({ status: 'expired' }))).toBe('ok');
    });
});

describe('safeNext', () => {
    it.each([
        ['/subscription', '/subscription'],
        ['/subscription/sub-1?x=1#top', '/subscription/sub-1?x=1#top'],
        ['/subscription/checkout/status?attempt=att-1', '/subscription/checkout/status?attempt=att-1'],
    ])('keeps %s', (next, kept) => {
        expect(safeNext(next)).toBe(kept);
    });

    it.each([
        [undefined],
        [null],
        [''],
        ['https://evil.example/subscription'],
        ['//evil.example/subscription'],
        ['/\\evil.example/subscription'],
        ['/subscription-evil'],
        ['/policy/terms'],
        ['/'],
        ['subscription'],
        ['/subscription/login'],
        ['/subscription/login/callback?code=x'],
        ['/subscription/../policy/terms'],
    ])('drops %s', next => {
        expect(safeNext(next)).toBeUndefined();
    });
});

describe('landingAfterSignIn', () => {
    it('sends a store subscriber to the store notice whatever they came for', () => {
        expect(
            landingAfterSignIn(account({ billingSource: 'appStore' }), '/subscription/checkout?plan=pro-tier-01')
        ).toBe('/subscription/store-managed');
    });

    it('returns to a safe next, and to the subscription list otherwise', () => {
        expect(landingAfterSignIn(account(), '/subscription/checkout?plan=pro-tier-01')).toBe(
            '/subscription/checkout?plan=pro-tier-01'
        );
        expect(landingAfterSignIn(account({ billingSource: 'none' }), 'https://evil.example')).toBe('/subscription');
        expect(landingAfterSignIn(account(), undefined)).toBe('/subscription');
    });
});
