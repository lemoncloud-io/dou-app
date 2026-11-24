import { checkoutSandbox } from './inAppCheckout';

const web = { kind: 'web', open: jest.fn() };

describe('checkoutSandbox', () => {
    it("takes the shell's value first, whatever the setting says", () => {
        expect(checkoutSandbox({ ...web, sandbox: true }, false, true)).toEqual({ on: true, from: 'shell' });
        expect(checkoutSandbox({ ...web, sandbox: false }, true, true)).toEqual({ on: false, from: 'shell' });
    });

    it('takes the debug setting where no shell injected a value, in a dev or local build', () => {
        expect(checkoutSandbox(web, true, true)).toEqual({ on: true, from: 'settings' });
        expect(checkoutSandbox(web, false, true)).toEqual({ on: false, from: 'none' });
    });

    it('ignores the setting in a production build', () => {
        expect(checkoutSandbox(web, true, false)).toEqual({ on: false, from: 'none' });
    });
});
