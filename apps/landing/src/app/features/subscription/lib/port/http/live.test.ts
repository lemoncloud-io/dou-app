import { createCardEntryChannel } from '../cardEntry';

import type { HttpPortOptions, PaymentWindow } from './createHttpPort';

const portOneWindow = vi.hoisted(() => vi.fn());
const stripeWindow = vi.hoisted(() => vi.fn());
const createHttpPort = vi.hoisted(() => vi.fn((options: HttpPortOptions) => options));
vi.mock('./portOneWindow', () => ({ portOneWindow }));
vi.mock('./stripeWindow', () => ({ createStripeWindow: () => stripeWindow }));
vi.mock('./createHttpPort', () => ({ createHttpPort }));
vi.mock('./runtime', () => ({
    startSessionRuntime: vi.fn(async () => undefined),
    subscriptionApi: vi.fn(() => ({})),
    relaySession: {},
}));

const { createLiveHttpPort } = await import('./live');

const SERVER = { socialOauth: 'https://oauth2.example.com', env: () => undefined };
const ISSUE = {
    customerId: 'c',
    issueId: 'i',
    issueName: 'n',
    required: [],
    storeId: 'mock',
    channelKey: 'mock',
    clientSecret: 'mock',
    publishableKey: 'mock',
};
const request = (provider: 'portone' | 'stripe') =>
    ({
        issue: { ...ISSUE, provider },
        purpose: 'start',
        terms: {},
        redirectUrl: 'http://localhost/return',
    }) as unknown as Parameters<PaymentWindow>[0];

describe('createLiveHttpPort', () => {
    beforeEach(() => {
        portOneWindow.mockReset();
        stripeWindow.mockReset();
    });

    it('opens the stand-in window for sandbox payments and calls neither provider SDK', async () => {
        const sandboxWindow = vi.fn<PaymentWindow>(async () => ({ outcome: 'registered', billingKey: 'sandbox-1' }));
        const options = (await createLiveHttpPort(SERVER, createCardEntryChannel(), {
            interval: () => '10m',
            paymentWindow: sandboxWindow,
        })) as unknown as HttpPortOptions;

        await options.paymentWindow(request('portone'));
        await options.paymentWindow(request('stripe'));

        expect(sandboxWindow).toHaveBeenCalledTimes(2);
        expect(portOneWindow).not.toHaveBeenCalled();
        expect(stripeWindow).not.toHaveBeenCalled();
        expect(options.sandbox?.interval()).toBe('10m');
    });

    it('opens the provider window the issue answer names without sandbox payments', async () => {
        const options = (await createLiveHttpPort(SERVER, createCardEntryChannel())) as unknown as HttpPortOptions;

        await options.paymentWindow(request('portone'));
        await options.paymentWindow(request('stripe'));

        expect(portOneWindow).toHaveBeenCalledTimes(1);
        expect(stripeWindow).toHaveBeenCalledTimes(1);
        expect(options.sandbox).toBeUndefined();
    });
});
