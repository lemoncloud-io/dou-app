import { checkoutSandbox } from './inAppCheckout';

describe('checkoutSandbox', () => {
    it('is on only where the web checkout carries the shell sandbox', () => {
        expect(checkoutSandbox({ kind: 'web', open: jest.fn(), sandbox: true })).toBe(true);
        expect(checkoutSandbox({ kind: 'web', open: jest.fn(), sandbox: false })).toBe(false);
        expect(checkoutSandbox({ kind: 'web', open: jest.fn() })).toBe(false);
        expect(checkoutSandbox({ kind: 'store', store: 'apple' })).toBe(false);
    });
});
