import { createPortSetup, portModeOf, serverPortOf } from './createPortSetup';
import { isPortError } from './port';
import { HTTP_METHODS, type HttpPort, type HttpSetup } from './port/http';

import type { SubscriptionServer } from '../../../config/subscriptionServer';

const SERVER: SubscriptionServer = {
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

describe('serverPortOf', () => {
    it('answers the server methods from the HTTP port and refuses every other one', async () => {
        const port = serverPortOf(fakeHttp().port);
        expect(await port.listPlans()).toBe('http:listPlans');
        expect(await port.signOut()).toBe('http:signOut');
        expect(isPortError(await port.listInvoices().catch(error => error), 'conflict')).toBe(true);
        expect(isPortError(await port.getBillingInfo().catch(error => error), 'conflict')).toBe(true);
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

    it('runs on the server alone, with no mock behind it, and says which methods it answers', async () => {
        const setup = createPortSetup({ account: true, server: SERVER, search: '', createHttp: fakeHttp });
        expect(setup.mock).toBeUndefined();
        expect(setup.Host).toBeDefined();
        expect(await setup.port.listPlans()).toBe('http:listPlans');
        expect(setup.supports?.('listPlans')).toBe(true);
        expect(setup.supports?.('listInvoices')).toBe(false);
        expect(setup.supports?.('resumeSubscription')).toBe(false);
        expect(isPortError(await setup.port.listInvoices().catch(error => error), 'conflict')).toBe(true);
        expect(window.sessionStorage.getItem('subscription.portMode')).toBe('server');
    });

    it('switches a tab to the mock alone and remembers it', () => {
        const setup = createPortSetup({ account: true, server: SERVER, search: '?mock=active', createHttp: fakeHttp });
        expect(setup.mock).toBeDefined();
        expect(window.sessionStorage.getItem('subscription.portMode')).toBe('mock');
    });
});
