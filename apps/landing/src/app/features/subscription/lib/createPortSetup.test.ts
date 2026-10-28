import { composePort, createPortSetup, portModeOf } from './createPortSetup';
import { createCatalogPort } from './catalogPort';
import { HTTP_METHODS, type HttpPort, type HttpSetup } from './port/http';

import type { SubscriptionServer } from '../../../config/subscriptionServer';

const SERVER: SubscriptionServer = {
    backend: 'https://api.example.com/dou-d1',
    paymentsMock: true,
    socialOauth: 'https://oauth2.example.com',
    env: () => undefined,
};

const fakeHttp = (): HttpSetup => ({
    port: Object.fromEntries(
        HTTP_METHODS.map(method => [method, vi.fn(async () => `http:${method}`)])
    ) as unknown as HttpPort,
    Host: ({ children }) => children as never,
});

beforeEach(() => {
    window.sessionStorage.clear();
    window.history.replaceState(null, '', '/');
});

describe('portModeOf', () => {
    it('runs on the server by default, on the mock for a scenario, and back with mock=off', () => {
        expect(portModeOf('', null)).toBe('server');
        expect(portModeOf('?mock=active', null)).toBe('mock');
        expect(portModeOf('?mock=off', 'mock')).toBe('server');
    });

    it('keeps the tab on what it last chose', () => {
        expect(portModeOf('', 'mock')).toBe('mock');
        expect(portModeOf('?plan=pro-tier-01', 'server')).toBe('server');
    });
});

describe('composePort', () => {
    it('takes the server methods from the HTTP port and every other one from the rest', async () => {
        const rest = createCatalogPort();
        const port = composePort(fakeHttp().port, rest);
        expect(await port.listPlans()).toBe('http:listPlans');
        expect(await port.signOut()).toBe('http:signOut');
        expect(port.listInvoices).toBe(rest.listInvoices);
        expect(port.getBillingInfo).toBe(rest.getBillingInfo);
    });
});

describe('createPortSetup', () => {
    it('is the mock where the build has no server addresses', () => {
        const createHttp = vi.fn(fakeHttp);
        const setup = createPortSetup({ account: true, server: null, search: '', createHttp });
        expect(setup.mock).toBeDefined();
        expect(setup.Host).toBeUndefined();
        expect(createHttp).not.toHaveBeenCalled();
    });

    it('composes the server with a signed-in mock, drawing only the stand-in window from it', async () => {
        const setup = createPortSetup({ account: true, server: SERVER, search: '', createHttp: fakeHttp });
        expect(setup.mock).toBeUndefined();
        expect(setup.standIn).toBeDefined();
        expect(setup.Host).toBeDefined();
        expect(await setup.port.listPlans()).toBe('http:listPlans');
        // The mock answers what the server cannot, as the account it was signed in with.
        expect((await setup.port.getBillingInfo()).emails).toEqual([]);
        expect(window.sessionStorage.getItem('subscription.portMode')).toBe('server');
    });

    it('does not carry a mock-only tab into the server account, and wipes it with the sign-out', async () => {
        // A mock-only tab that ran the `active` scenario, with its own billing email. The mock reads the
        // live URL, so the page is put there.
        window.history.replaceState(null, '', '/subscription?mock=active');
        const mockOnly = createPortSetup({
            account: true,
            server: SERVER,
            search: '?mock=active',
            createHttp: fakeHttp,
        });
        expect((await mockOnly.port.getBillingInfo()).emails.length).toBeGreaterThan(0);

        window.history.replaceState(null, '', '/subscription?mock=off');
        const composed = createPortSetup({ account: true, server: SERVER, search: '?mock=off', createHttp: fakeHttp });
        expect((await composed.port.getBillingInfo()).emails).toEqual([]);
        await composed.port.requestEmailCode('minji.kim@gmail.com');
        expect((await composed.port.getBillingInfo()).emails).toHaveLength(1);
        expect(await composed.port.signOut()).toBe('http:signOut');
        expect((await composed.port.getBillingInfo()).emails).toEqual([]);
    });

    it('opens the provider window, not the stand-in, when the server takes real payments', () => {
        const setup = createPortSetup({
            account: true,
            server: { ...SERVER, paymentsMock: false },
            search: '',
            createHttp: fakeHttp,
        });
        expect(setup.standIn).toBeUndefined();
    });

    it('switches a tab to the mock alone and remembers it', () => {
        const setup = createPortSetup({ account: true, server: SERVER, search: '?mock=active', createHttp: fakeHttp });
        expect(setup.mock).toBeDefined();
        expect(window.sessionStorage.getItem('subscription.portMode')).toBe('mock');
    });
});
