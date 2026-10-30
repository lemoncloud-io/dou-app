import { MOCK_PLANS } from '../../lib/mock';
import {
    cancelSceneOf,
    changeTargetsOf,
    chargeCardOf,
    ddayParts,
    endedOn,
    expiryOf,
    listCardOf,
    monthDay,
    resumeDialogOf,
    scheduledChangeDialogOf,
    splitSubscriptions,
} from './manageModel';

import type { Account, PaymentMethod, Subscription } from '../../types';

const sub = (overrides: Partial<Subscription> = {}): Subscription => ({
    id: 'sub-2',
    planId: 'pro-tier-02',
    status: 'active',
    startedAt: '2026-09-20',
    billingDay: 20,
    provider: 'portone',
    nextBillingAt: '2026-11-20',
    defaultPaymentMethodId: 'pm-1',
    ...overrides,
});

const card = (overrides: Partial<PaymentMethod> = {}): PaymentMethod => ({
    id: 'pm-1',
    brand: 'Shinhan',
    last4: '1234',
    provider: 'portone',
    expMonth: 4,
    expYear: 2029,
    isDefault: true,
    expiringSoon: false,
    ...overrides,
});

const account: Account = { id: 'acc-1', provider: 'google', billingSource: 'web', trialUsed: true };
const plan = (sort: number) => MOCK_PLANS[sort - 1];

describe('splitSubscriptions', () => {
    it('separates the live subscription from the ended ones, latest ended first', () => {
        const older = sub({ id: 'old', status: 'expired', expiredAt: '2026-05-01' });
        const newer = sub({ id: 'new', status: 'expired', expiredAt: '2026-09-19' });
        const live = sub({ id: 'live', status: 'pastDue' });

        expect(splitSubscriptions([older, live, newer])).toEqual({ live, ended: [newer, older] });
    });

    it('has no live subscription when every one has ended', () => {
        expect(splitSubscriptions([sub({ status: 'expired' })]).live).toBeUndefined();
        expect(splitSubscriptions([])).toEqual({ live: undefined, ended: [] });
    });
});

describe('endedOn', () => {
    it('prefers the expiry date and falls back to the end date', () => {
        expect(endedOn(sub({ expiredAt: '2026-09-19', endsAt: '2026-09-20' }))).toBe('2026-09-19');
        expect(endedOn(sub({ endsAt: '2026-09-20' }))).toBe('2026-09-20');
        expect(endedOn(sub())).toBeUndefined();
    });
});

describe('chargeCardOf', () => {
    it('finds the card the subscription names', () => {
        const second = card({ id: 'pm-2', isDefault: false });
        expect(chargeCardOf(sub({ defaultPaymentMethodId: 'pm-2' }), [card(), second])).toBe(second);
    });

    it('finds none when the subscription names no card, or one that is gone', () => {
        expect(chargeCardOf(sub({ defaultPaymentMethodId: undefined }), [card()])).toBeUndefined();
        expect(chargeCardOf(sub({ defaultPaymentMethodId: 'pm-9' }), [card()])).toBeUndefined();
    });
});

describe('expiryOf', () => {
    it('prints month and two-digit year, zero-padded', () => {
        expect(expiryOf(card({ expMonth: 4, expYear: 2029 }))).toBe('04/29');
        expect(expiryOf(card({ expMonth: 11, expYear: 2030 }))).toBe('11/30');
        expect(expiryOf(card({ expMonth: 1, expYear: 2105 }))).toBe('01/05');
    });
});

describe('listCardOf', () => {
    it('draws a subscription in good standing as the full card', () => {
        expect(listCardOf({ kind: 'active' })).toBe('summary');
        expect(listCardOf({ kind: 'restored' })).toBe('summary');
    });

    it('draws every other scene as a status line', () => {
        expect(listCardOf({ kind: 'trial' })).toBe('status');
        expect(listCardOf({ kind: 'pastDue' })).toBe('status');
        expect(listCardOf({ kind: 'cancelScheduled' })).toBe('status');
        expect(listCardOf({ kind: 'downgradeScheduled', planId: 'pro-tier-01', date: '2026-11-20' })).toBe('status');
    });
});

describe('changeTargetsOf', () => {
    it('offers the plans one step up and down, the higher first', () => {
        expect(changeTargetsOf(plan(2), MOCK_PLANS, account)).toEqual([
            { plan: plan(3), kind: 'upgrade' },
            { plan: plan(1), kind: 'downgrade' },
        ]);
    });

    it('offers only one direction at either end of the range', () => {
        expect(changeTargetsOf(plan(1), MOCK_PLANS, account).map(t => t.plan.sort)).toEqual([2]);
        expect(changeTargetsOf(plan(5), MOCK_PLANS, account).map(t => t.plan.sort)).toEqual([4]);
    });

    it('offers nothing to an account billed by a store', () => {
        expect(changeTargetsOf(plan(2), MOCK_PLANS, { ...account, billingSource: 'appStore' })).toEqual([]);
    });
});

describe('resumeDialogOf', () => {
    it('asks to confirm when the subscription still has its card', () => {
        expect(resumeDialogOf(sub({ status: 'cancelScheduled' }), [card()])).toBe('confirm');
    });

    it('sends the reader to add a card when it has none', () => {
        expect(resumeDialogOf(sub({ status: 'cancelScheduled', defaultPaymentMethodId: undefined }), [])).toBe(
            'noCard'
        );
    });
});

describe('scheduledChangeDialogOf', () => {
    const downgrading = sub({ pendingChange: { planId: 'pro-tier-01', effectiveAt: '2026-11-20' } });

    it('asks to confirm before the day the change applies', () => {
        expect(scheduledChangeDialogOf(downgrading, new Date(2026, 10, 19))).toBe('confirm');
    });

    it('refuses on the day the change applies, and after', () => {
        expect(scheduledChangeDialogOf(downgrading, new Date(2026, 10, 20))).toBe('sameDay');
        expect(scheduledChangeDialogOf(downgrading, new Date(2026, 10, 21))).toBe('sameDay');
    });

    it('has nothing to open with no change scheduled', () => {
        expect(scheduledChangeDialogOf(sub(), new Date(2026, 10, 1))).toBeUndefined();
    });
});

describe('cancelSceneOf', () => {
    const now = new Date(2026, 10, 1);

    it('offers the form where the detail screen offers cancelling', () => {
        expect(cancelSceneOf(sub({ status: 'active' }), now)).toBe('form');
        expect(cancelSceneOf(sub({ status: 'trial' }), now)).toBe('form');
    });

    it('shows the result once it is cancelled', () => {
        expect(cancelSceneOf(sub({ status: 'cancelScheduled' }), now)).toBe('done');
    });

    it('offers nothing to a subscription that cannot be cancelled', () => {
        expect(cancelSceneOf(sub({ status: 'pastDue' }), now)).toBe('unavailable');
        expect(cancelSceneOf(sub({ status: 'restricted' }), now)).toBe('unavailable');
        expect(cancelSceneOf(sub({ status: 'expired' }), now)).toBe('unavailable');
    });

    it('offers nothing while a downgrade is scheduled, as the detail screen does not', () => {
        const downgrading = sub({ pendingChange: { planId: 'pro-tier-01', effectiveAt: '2026-11-20' } });
        expect(cancelSceneOf(downgrading, now)).toBe('unavailable');
    });
});

describe('monthDay', () => {
    it('keeps the month and day of an ISO date', () => {
        expect(monthDay('2026-11-02')).toBe('11.02');
        expect(monthDay('2026-01-31T09:00:00Z')).toBe('01.31');
    });
});

describe('ddayParts', () => {
    it('counts down before the day, names the day, and counts up after it', () => {
        expect(ddayParts(5)).toEqual({ key: 'before', count: 5 });
        expect(ddayParts(0)).toEqual({ key: 'today', count: 0 });
        expect(ddayParts(-2)).toEqual({ key: 'after', count: 2 });
    });
});
