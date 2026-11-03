import { canCheckoutOnWeb, isHeldByWeb, isWebBilled } from './webCheckout';

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
        expect(isHeldByWeb({ hasLiveReceipt: true }, 'stripe')).toBe(true);
    });

    it('does not hold for a lapsed website receipt, or a running store one', () => {
        expect(isHeldByWeb({ hasLiveReceipt: false }, 'portone')).toBe(false);
        expect(isHeldByWeb({ hasLiveReceipt: true }, 'google')).toBe(false);
    });
});
