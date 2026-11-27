import { SHELL_HARNESS_GLOBAL } from '@chatic/runtime-hybrid-web';

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
    it('carries the shell sandbox for the in-app checkout', () => {
        expect(shellWebCheckout({ version: 1, sandbox: true }).sandbox).toBe(true);
        expect(shellWebCheckout({ version: 1, sandbox: false }).sandbox).toBe(false);
    });

    it('leaves for the local subscription website with the sandbox, for what stays there', () => {
        shellWebCheckout({ version: 1, sandbox: true, subscriptionWeb: 'http://localhost:5004' }).open(
            'https://app-dev.chatic.io/subscription'
        );
        expect(leaveForWeb).toHaveBeenCalledWith('http://localhost:5004/subscription?sandbox=1', { replace: false });
    });
});
