import { SHELL_HARNESS_GLOBAL } from '@chatic/runtime-web';

import { hybridWebCheckout, isProductionBuild, shellWebCheckout } from './shellWebCheckout';
import { webCheckout } from './webCheckout';

jest.mock('./webCheckout', () => {
    const leaveForWeb = jest.fn();
    return { leaveForWeb, webCheckout: jest.fn(() => ({ kind: 'web', open: leaveForWeb })) };
});

const { leaveForWeb } = jest.requireMock('./webCheckout') as { leaveForWeb: jest.Mock };

const plans = 'https://app-dev.chatic.io/subscription/plans';
const harnessed = { [SHELL_HARNESS_GLOBAL]: { version: 1, sandbox: true } };

afterEach(() => {
    jest.clearAllMocks();
});

describe('isProductionBuild', () => {
    it('reads harness values only in a dev or local build', () => {
        expect(isProductionBuild('DEV')).toBe(false);
        expect(isProductionBuild('LOCAL')).toBe(false);
        expect(isProductionBuild('PROD')).toBe(true);
        expect(isProductionBuild(undefined)).toBe(true);
    });
});

describe('hybridWebCheckout', () => {
    it('ignores the harness values in a production build and leaves for the website as before', () => {
        hybridWebCheckout(harnessed).open(plans);
        expect(webCheckout).toHaveBeenCalled();
        expect(leaveForWeb).toHaveBeenCalledWith(plans);
    });

    it('leaves for the website when the host injected no harness values, as the mobile app', () => {
        hybridWebCheckout({});
        expect(webCheckout).toHaveBeenCalled();
    });
});

describe('shellWebCheckout', () => {
    it('opens the shell checkout screen with the local address and the sandbox, and stays in the app', () => {
        const checkout = shellWebCheckout({ version: 1, sandbox: true, subscriptionWeb: 'http://localhost:5004' });
        const open = jest.fn();
        checkout.shellScreen.bind(open);

        checkout.open(plans, { replace: true });

        expect(open).toHaveBeenCalledWith({ url: 'http://localhost:5004/subscription/plans?sandbox=1', replace: true });
        expect(leaveForWeb).not.toHaveBeenCalled();
    });

    it('leaves for the website when no screen is bound, or once it is unbound', () => {
        const checkout = shellWebCheckout({ version: 1, sandbox: false });
        const unbind = checkout.shellScreen.bind(jest.fn());
        unbind();
        checkout.open(plans);
        expect(leaveForWeb).toHaveBeenCalledWith(plans, { replace: false });
    });
});
