import { shellCheckoutScreen } from './shellCheckout';

describe('shellCheckoutScreen', () => {
    it('finds the screen only on the shell-only web checkout', () => {
        const screen = { bind: () => () => undefined };
        expect(shellCheckoutScreen({ kind: 'web', open: jest.fn(), shellScreen: screen })).toBe(screen);
        expect(shellCheckoutScreen({ kind: 'web', open: jest.fn() })).toBeNull();
        expect(shellCheckoutScreen({ kind: 'store', store: 'apple' })).toBeNull();
        expect(shellCheckoutScreen({ kind: 'web', shellScreen: {} })).toBeNull();
    });
});
