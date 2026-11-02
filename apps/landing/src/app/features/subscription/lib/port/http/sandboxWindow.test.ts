import { createSandboxWindow } from './sandboxWindow';

import type { PaymentWindowPresenter } from '../../mock';

const request = {
    issue: {
        provider: 'portone' as const,
        storeId: 'mock',
        channelKey: 'mock',
        customerId: 'c',
        issueId: 'i',
        issueName: 'n',
        required: [],
    },
    purpose: 'start' as const,
    planId: 'pro-tier-01' as const,
    terms: {},
    redirectUrl: 'http://localhost/return',
};

describe('createSandboxWindow', () => {
    it('asks the stand-in window, and turns a registered card into a made-up token', async () => {
        const { host, paymentWindow } = createSandboxWindow(() => 'sandbox-abc');
        const presenter = vi.fn<PaymentWindowPresenter>(async () => 'registered');
        host.setPaymentWindow(presenter);

        expect(await paymentWindow(request)).toEqual({ outcome: 'registered', billingKey: 'sandbox-abc' });
        expect(presenter).toHaveBeenCalledWith({ purpose: 'start', planId: 'pro-tier-01', suggested: 'registered' });
    });

    it('reads a failed and a closed window as a real window would be read', async () => {
        const { host, paymentWindow } = createSandboxWindow();
        host.setPaymentWindow(async () => 'failed');
        expect(await paymentWindow(request)).toEqual({ outcome: 'failed' });
        host.setPaymentWindow(async () => 'closed');
        expect(await paymentWindow(request)).toEqual({ outcome: 'closed' });
    });

    it('makes a fresh token each time, and ends closed with no window mounted', async () => {
        const { host, paymentWindow } = createSandboxWindow();
        expect(await paymentWindow(request)).toEqual({ outcome: 'closed' });
        host.setPaymentWindow(async () => 'registered');
        const first = await paymentWindow(request);
        const second = await paymentWindow(request);
        expect(first).toMatchObject({ billingKey: expect.stringMatching(/^sandbox-/) });
        expect(first).not.toEqual(second);
    });
});
