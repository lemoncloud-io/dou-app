import { host, resolveCheckoutMethod, resolveFilesMethod, resolveMediaMethod, resolveSignIn } from '@chatic/host';

import { publishHostPorts } from './publishHostPorts';
import { storeCheckout } from './checkout/storeCheckout';

jest.mock('@chatic/host', () => ({
    ...jest.requireActual('@chatic/host'),
    resolveCheckoutMethod: jest.fn(),
    resolveMediaMethod: jest.fn(() => 'shell'),
    resolveFilesMethod: jest.fn(() => 'shell'),
    resolveSignIn: jest.fn(() => ({ kind: 'shell', os: 'ios' })),
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
    it.each(['shell', 'browser'] as const)('lets %s pick when the host says so', method => {
        (resolveMediaMethod as jest.Mock).mockReturnValue(method);
        publishing('none');

        expect(host.ports.media).toEqual({ kind: method });
    });
});

describe('publishHostPorts — the v4 domains', () => {
    it('publishes what each resolver answers', () => {
        publishing('none');

        expect(host.ports.signIn).toEqual({ kind: 'shell', os: 'ios' });
        expect(resolveSignIn).toHaveBeenCalled();
        // The rest are read from the real profile, which under jsdom has no bridge: the page.
        expect(host.ports.links).toEqual({ kind: 'browser' });
        expect(host.ports.appShell).toEqual({ kind: 'browser', os: null });
        expect(host.ports.diagnostics).toEqual({ kind: 'browser' });
        expect(host.ports.push).toEqual({ kind: 'browser' });
    });
});

describe('publishHostPorts — files', () => {
    it.each(['shell', 'browser'] as const)('lets %s move files when the host says so', method => {
        (resolveFilesMethod as jest.Mock).mockReturnValue(method);
        publishing('none');

        expect(host.ports.files).toEqual({ kind: method });
    });
});
