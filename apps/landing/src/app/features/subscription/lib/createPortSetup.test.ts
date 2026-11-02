import { createPortSetup, portModeOf, sandboxOf, serverPortOf } from './createPortSetup';
import { isPortError } from './port';
import { createCardEntryChannel } from './port/cardEntry';
import { HTTP_METHODS, type HttpPort, type HttpSandbox, type HttpSetup } from './port/http';

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
    cardEntry: createCardEntryChannel(),
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

describe('sandboxOf', () => {
    it('is off unless asked for, on with sandbox=1, off again with sandbox=0, and kept for the tab', () => {
        expect(sandboxOf('', null)).toBe(false);
        expect(sandboxOf('?sandbox=1', null)).toBe(true);
        expect(sandboxOf('?sandbox=0', '1')).toBe(false);
        expect(sandboxOf('?plan=pro-tier-01', '1')).toBe(true);
        expect(sandboxOf('?sandbox=yes', null)).toBe(false);
    });
});

describe('createPortSetup — sandbox payments', () => {
    // The HTTP setup as `createPortSetup` calls it, keeping what it was given.
    const httpSpy = () => vi.fn((_server: SubscriptionServer, _options: { sandbox?: HttpSandbox }) => fakeHttp());

    it('ignores sandbox where the account surface is shut — the production host', () => {
        const createHttp = httpSpy();
        window.sessionStorage.setItem('subscription.sandbox', '1');
        const setup = createPortSetup({ account: false, server: SERVER, search: '?sandbox=1', createHttp });
        expect(setup.sandbox).toBeUndefined();
        expect(createHttp).not.toHaveBeenCalled();
    });

    it('has nothing to put in sandbox on the mock', () => {
        const setup = createPortSetup({
            account: true,
            server: SERVER,
            search: '?mock=new&sandbox=1',
            createHttp: fakeHttp,
        });
        expect(setup.mock).toBeDefined();
        expect(setup.sandbox).toBeUndefined();
    });

    it('hands the HTTP port sandbox payments when asked, with the period chosen for the next start', () => {
        const createHttp = httpSpy();
        const setup = createPortSetup({ account: true, server: SERVER, search: '?sandbox=1', createHttp });
        expect(setup.sandbox?.enabled).toBe(true);
        const [, options] = createHttp.mock.calls[0];
        expect(options.sandbox?.interval()).toBeUndefined();

        setup.sandbox?.setInterval('10m');
        expect(options.sandbox?.interval()).toBe('10m');
        expect(window.sessionStorage.getItem('subscription.sandboxInterval')).toBe('10m');
        // The tab keeps both, so the reload after a sign-in still runs on sandbox payments.
        const again = httpSpy();
        createPortSetup({ account: true, server: SERVER, search: '', createHttp: again });
        expect(again.mock.calls[0][1].sandbox?.interval()).toBe('10m');
    });

    it('has no sandbox in a build pointed at production, even on a development host', () => {
        const createHttp = httpSpy();
        const prodBuild = { ...SERVER, env: (name: string) => (name === 'VITE_ENV' ? 'PROD' : undefined) };
        const setup = createPortSetup({ account: true, server: prodBuild, search: '?sandbox=1', createHttp });
        expect(setup.sandbox).toBeUndefined();
        expect(createHttp.mock.calls[0][1]).toEqual({});
    });

    it('starts a fresh tab on the product month, and takes sandbox out of the address once read', () => {
        window.sessionStorage.clear();
        window.history.replaceState(null, '', '/subscription/plans?sandbox=1&plan=pro-tier-01');
        const setup = createPortSetup({
            account: true,
            server: SERVER,
            search: window.location.search,
            createHttp: httpSpy(),
        });
        expect(setup.sandbox?.interval()).toBe('');
        expect(window.location.search).toBe('?plan=pro-tier-01');
        expect(window.sessionStorage.getItem('subscription.sandbox')).toBe('1');
    });

    it('runs real payments by default, still offering the switch', () => {
        const createHttp = httpSpy();
        const setup = createPortSetup({ account: true, server: SERVER, search: '', createHttp });
        expect(setup.sandbox?.enabled).toBe(false);
        expect(createHttp.mock.calls[0][1]).toEqual({});
    });
});
