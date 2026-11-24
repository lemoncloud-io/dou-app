import { canCheckoutOnWeb, isHeldByWeb, isWebBilled, webPlanPlatform } from './webCheckout';

describe('webPlanPlatform', () => {
    it("names the website's provider, whose list holds the membership's plan", () => {
        expect(webPlanPlatform('stripe')).toBe('stripe');
        expect(webPlanPlatform('portone')).toBe('portone');
    });

    it('names nothing for a store or no platform, which the unfiltered list already covers', () => {
        expect(webPlanPlatform('apple')).toBeUndefined();
        expect(webPlanPlatform(undefined)).toBeUndefined();
    });
});

describe('isWebBilled', () => {
    it('recognises the website’s two payment providers', () => {
        expect(isWebBilled('portone')).toBe(true);
        expect(isWebBilled('stripe')).toBe(true);
    });

    it('does not count a store, or a platform the membership does not name', () => {
        expect(isWebBilled('apple')).toBe(false);
        expect(isWebBilled('google')).toBe(false);
        expect(isWebBilled(undefined)).toBe(false);
        expect(isWebBilled('')).toBe(false);
    });
});

describe('canCheckoutOnWeb', () => {
    it('sends someone with no running receipt to the website, whatever bought the last one', () => {
        expect(canCheckoutOnWeb({ hasLiveReceipt: false }, undefined)).toBe(true);
        expect(canCheckoutOnWeb({ hasLiveReceipt: false }, 'apple')).toBe(true);
        expect(canCheckoutOnWeb({ hasLiveReceipt: false }, 'stripe')).toBe(true);
    });

    it('sends a running website subscription to the website', () => {
        expect(canCheckoutOnWeb({ hasLiveReceipt: true }, 'portone')).toBe(true);
    });

    it('keeps a running store subscription with its store', () => {
        expect(canCheckoutOnWeb({ hasLiveReceipt: true }, 'apple')).toBe(false);
        expect(canCheckoutOnWeb({ hasLiveReceipt: true }, 'google')).toBe(false);
    });

    it('keeps a running receipt that names no platform with the stores, which sold every receipt before the website', () => {
        expect(canCheckoutOnWeb({ hasLiveReceipt: true }, undefined)).toBe(false);
    });
});

describe('isHeldByWeb', () => {
    it('holds while a receipt the website bills is running', () => {
        expect(isHeldByWeb({ hasLiveReceipt: true, isEntitled: true }, 'stripe')).toBe(true);
    });

    it('holds while an admin grant sits on a lapsed website receipt, as the relay counts it', () => {
        expect(isHeldByWeb({ hasLiveReceipt: false, isAdminOverridden: true, isEntitled: true }, 'portone')).toBe(true);
    });

    it('holds while a website renewal payment is still being confirmed', () => {
        expect(isHeldByWeb({ hasLiveReceipt: false, isEntitled: false }, 'portone', 'pending')).toBe(true);
    });

    it('does not hold for a lapsed or admin-blocked website receipt, or a running store one', () => {
        expect(isHeldByWeb({ hasLiveReceipt: false, isEntitled: false }, 'portone', 'expired')).toBe(false);
        expect(isHeldByWeb({ hasLiveReceipt: false, isAdminOverridden: true, isEntitled: false }, 'stripe')).toBe(
            false
        );
        expect(isHeldByWeb({ hasLiveReceipt: true, isEntitled: true }, 'google', 'pending')).toBe(false);
    });
});
