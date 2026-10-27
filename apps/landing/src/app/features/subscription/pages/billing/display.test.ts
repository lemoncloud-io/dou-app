import { addedCardOf, cardExpiry, cardExpiryMonth, nextRetryOf, regionName, toggleReceive } from './display';

import type { PaymentMethod, Subscription } from '../../types';

const card = (id: string, overrides: Partial<PaymentMethod> = {}): PaymentMethod => ({
    id,
    brand: '신한',
    last4: '1234',
    expMonth: 8,
    expYear: 2028,
    isDefault: false,
    expiringSoon: false,
    ...overrides,
});

describe('cardExpiry', () => {
    it('prints month and year as two digits each', () => {
        expect(cardExpiry({ expMonth: 8, expYear: 2028 })).toBe('08/28');
        expect(cardExpiry({ expMonth: 11, expYear: 2030 })).toBe('11/30');
    });

    it('keeps a leading zero on the year', () => {
        expect(cardExpiry({ expMonth: 1, expYear: 2105 })).toBe('01/05');
    });
});

describe('cardExpiryMonth', () => {
    it('prints the expiry as a month in the app date format', () => {
        expect(cardExpiryMonth({ expMonth: 11, expYear: 2026 })).toBe('2026.11');
    });
});

describe('addedCardOf', () => {
    it('finds the card that was not there before', () => {
        const before = [card('pm-1'), card('pm-2')];
        expect(addedCardOf(before, [...before, card('pm-3')])?.id).toBe('pm-3');
    });

    it('finds nothing when the list did not grow', () => {
        const before = [card('pm-1')];
        expect(addedCardOf(before, before)).toBeUndefined();
    });

    it('finds the first card on an empty account', () => {
        expect(addedCardOf([], [card('pm-9', { isDefault: true })])?.id).toBe('pm-9');
    });
});

describe('regionName', () => {
    it('names the country in the reader language', () => {
        expect(regionName('KR', 'en')).toBe('South Korea');
        expect(regionName('KR', 'ko')).toBe('대한민국');
    });

    it('falls back to the code when it cannot be named', () => {
        expect(regionName('', 'en')).toBe('');
    });
});

describe('toggleReceive', () => {
    it('adds a kind in the fixed order', () => {
        expect(toggleReceive(['notice'], 'receipt', true)).toEqual(['receipt', 'notice']);
    });

    it('removes a kind', () => {
        expect(toggleReceive(['receipt', 'notice'], 'receipt', false)).toEqual(['notice']);
    });

    it('switching on a kind already on leaves the list as it was', () => {
        expect(toggleReceive(['receipt'], 'receipt', true)).toEqual(['receipt']);
    });
});

describe('nextRetryOf', () => {
    const failing = {
        id: 'sub-2',
        planId: 'pro-tier-02',
        status: 'pastDue',
        startedAt: '2026-09-30',
        billingDay: 30,
        retryAt: ['2026-10-31', '2026-11-02', '2026-11-04'],
    } as Subscription;
    const on = (iso: string) => new Date(`${iso}T09:00:00`);

    it('picks the first retry still to come', () => {
        expect(nextRetryOf(failing, on('2026-11-01'))).toBe('2026-11-02');
    });

    it('counts a retry due today', () => {
        expect(nextRetryOf(failing, on('2026-11-02'))).toBe('2026-11-02');
    });

    it('has nothing once every retry has passed', () => {
        expect(nextRetryOf(failing, on('2026-11-05'))).toBeUndefined();
    });

    it('has nothing without a schedule or a subscription', () => {
        expect(nextRetryOf({ ...failing, retryAt: undefined }, on('2026-11-01'))).toBeUndefined();
        expect(nextRetryOf(undefined, on('2026-11-01'))).toBeUndefined();
    });
});
