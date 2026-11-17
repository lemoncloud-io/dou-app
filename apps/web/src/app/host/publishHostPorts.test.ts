import { host, resolveCheckoutMethod, resolveMediaMethod } from '@chatic/host';

import { publishHostPorts } from './publishHostPorts';
import { storeCheckout } from './checkout/storeCheckout';

jest.mock('@chatic/host', () => ({
    ...jest.requireActual('@chatic/host'),
    resolveCheckoutMethod: jest.fn(),
    resolveMediaMethod: jest.fn(() => 'app'),
}));
jest.mock('./checkout/storeCheckout', () => ({
    storeCheckout: jest.fn((store: string) => ({ kind: 'store', store })),
}));

const publishing = (method: string) => {
    (resolveCheckoutMethod as jest.Mock).mockReturnValue(method);
    host.resetForTests();
    publishHostPorts();
    return host.ports.checkout;
};

afterEach(() => host.resetForTests());

describe('publishHostPorts — checkout', () => {
    it.each(['apple', 'google'] as const)("sells through %s's store when the host says so", store => {
        expect(publishing(store)).toEqual({ kind: 'store', store });
        expect(storeCheckout).toHaveBeenCalledWith(store);
    });

    it('hands over to the website when the host sells there', () => {
        expect(publishing('web').kind).toBe('web');
    });

    it('sells nothing when the host sells nothing', () => {
        expect(publishing('none')).toEqual({ kind: 'none' });
    });
});

describe('publishHostPorts — media', () => {
    it.each(['app', 'page'] as const)('lets %s pick when the host says so', method => {
        (resolveMediaMethod as jest.Mock).mockReturnValue(method);
        publishing('none');

        expect(host.ports.media).toEqual({ kind: method });
    });
});
