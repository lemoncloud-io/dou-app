import type { SubscriptionSummary } from './membershipStatus';
import {
    EXPIRED_HOLD_MS,
    daysUntil,
    deriveBanner,
    deriveCloudManageBanner,
    deriveInfoRows,
    isRestoreTransition,
    isWithinExpiredHold,
    productStatusWord,
    subscriptionStatusWord,
} from './scene';

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_760_000_000_000;

const summary = (overrides: Partial<SubscriptionSummary> = {}): SubscriptionSummary => ({
    state: 'active',
    isEntitled: true,
    hasLiveReceipt: true,
    productId: '#pro-tier-02',
    validUntil: NOW + 10 * DAY,
    ...overrides,
});

describe('deriveBanner', () => {
    const base = { autoRenewing: true, hasPrice: true, restored: false };

    it('reminds of the next charge on a plain running subscription', () => {
        expect(deriveBanner({ ...base, summary: summary() })).toBe('autoRenew');
    });

    it('leads with the block, whatever else is true', () => {
        expect(deriveBanner({ ...base, restored: true, summary: summary({ state: 'blocked' }) })).toBe('blocked');
    });

    it('shows the ending for a scheduled cancellation and for an expiry', () => {
        expect(deriveBanner({ ...base, summary: summary({ state: 'cancelScheduled' }) })).toBe('cancelScheduled');
        expect(deriveBanner({ ...base, summary: summary({ state: 'expired', isEntitled: false }) })).toBe('expired');
    });

    it('prefers the restored note over the renewal reminder', () => {
        expect(deriveBanner({ ...base, restored: true, summary: summary() })).toBe('restored');
    });

    it('drops the renewal reminder without a price, a live receipt, auto-renew, or while a change is queued', () => {
        expect(deriveBanner({ ...base, hasPrice: false, summary: summary() })).toBeUndefined();
        expect(deriveBanner({ ...base, summary: summary({ hasLiveReceipt: false }) })).toBeUndefined();
        expect(deriveBanner({ ...base, autoRenewing: false, summary: summary() })).toBeUndefined();
        expect(deriveBanner({ ...base, summary: summary({ pendingProductId: '#pro-tier-01' }) })).toBeUndefined();
    });

    it('treats an unknown auto-renew flag as on', () => {
        expect(deriveBanner({ ...base, autoRenewing: undefined, summary: summary() })).toBe('autoRenew');
    });

    it('shows nothing without a subscription', () => {
        expect(deriveBanner({ ...base, summary: summary({ state: 'none', isEntitled: false }) })).toBeUndefined();
    });
});

describe('isWithinExpiredHold', () => {
    it('holds for the relay grace window after the end date', () => {
        const validUntil = NOW - 5 * DAY;
        expect(isWithinExpiredHold(validUntil, NOW)).toBe(true);
        expect(isWithinExpiredHold(validUntil, validUntil + EXPIRED_HOLD_MS)).toBe(false);
    });

    it('is false without an end date', () => {
        expect(isWithinExpiredHold(undefined, NOW)).toBe(false);
    });
});

describe('status words', () => {
    it('keeps the product card on "subscribed" through a scheduled cancellation', () => {
        expect(productStatusWord('cancelScheduled')).toEqual({ key: 'active', tone: 'active' });
        expect(productStatusWord('expired').tone).toBe('danger');
        expect(productStatusWord('blocked').key).toBe('blocked');
    });

    it('reads a queued downgrade as ending in the info table', () => {
        expect(subscriptionStatusWord('active', true)).toEqual({ key: 'ending', tone: 'danger' });
        expect(subscriptionStatusWord('active', false)).toEqual({ key: 'active', tone: 'active' });
        expect(subscriptionStatusWord('cancelScheduled', false).key).toBe('ending');
    });
});

describe('deriveInfoRows', () => {
    it('lists the next charge only for a plain running subscription', () => {
        expect(deriveInfoRows('active', false, false)).toEqual([
            'status',
            'price',
            'period',
            'nextPayment',
            'scheduledPrice',
            'platform',
        ]);
    });

    it('names validUntil as the end date for a cancellation or a queued change', () => {
        expect(deriveInfoRows('cancelScheduled', false, false)).toContain('endsOn');
        expect(deriveInfoRows('active', true, false)).toEqual(['status', 'price', 'period', 'endsOn', 'platform']);
    });

    it('names it the expiry date once lapsed, and adds the grant row under an override', () => {
        expect(deriveInfoRows('expired', false, false)).toContain('expiredOn');
        expect(deriveInfoRows('blocked', false, true)).toEqual(['status', 'price', 'period', 'platform', 'adminGrant']);
    });
});

describe('daysUntil', () => {
    it('rounds a partial day up', () => {
        expect(daysUntil(NOW + 2 * DAY + 1, NOW)).toBe(3);
        expect(daysUntil(NOW + DAY, NOW)).toBe(1);
    });

    it('is undefined once the target has passed or is missing', () => {
        expect(daysUntil(NOW, NOW)).toBeUndefined();
        expect(daysUntil(NOW - DAY, NOW)).toBeUndefined();
        expect(daysUntil(undefined, NOW)).toBeUndefined();
    });
});

describe('isRestoreTransition', () => {
    it('is an ending turning back into a running plan', () => {
        expect(isRestoreTransition('cancelScheduled', 'active')).toBe(true);
        expect(isRestoreTransition('expired', 'active')).toBe(true);
    });

    it('needs both sides to have been seen', () => {
        expect(isRestoreTransition(undefined, 'active')).toBe(false);
        expect(isRestoreTransition('none', 'active')).toBe(false);
        expect(isRestoreTransition('active', 'active')).toBe(false);
        expect(isRestoreTransition('cancelScheduled', 'expired')).toBe(false);
    });
});

describe('deriveCloudManageBanner', () => {
    it('leads with a block, then a lapse, then a queued change', () => {
        expect(deriveCloudManageBanner('blocked', true)).toBe('blocked');
        expect(deriveCloudManageBanner('expired', true)).toBe('expired');
        expect(deriveCloudManageBanner('active', true)).toBe('pendingChange');
    });

    it('shows nothing for a plan that is simply running, ending, or absent', () => {
        expect(deriveCloudManageBanner('active', false)).toBeUndefined();
        expect(deriveCloudManageBanner('cancelScheduled', false)).toBeUndefined();
        expect(deriveCloudManageBanner('none', false)).toBeUndefined();
    });
});
