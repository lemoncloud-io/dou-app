import { buyPlan, shellPaymentWindow } from './flow';

import type { CardEntryChannel, Issue, PaymentWindow } from '@chatic/web-checkout';

const request = (provider: 'portone' | 'stripe') =>
    ({
        issue: { provider } as Issue,
        purpose: 'start',
        planId: 'pro-tier-01',
        terms: {},
        redirectUrl: 'http://localhost:5007/subscription/shell-checkout?plan=pro-tier-01',
    }) as Parameters<PaymentWindow>[0];

describe('shellPaymentWindow', () => {
    it('answers from the stand-in card in the sandbox and loads no provider window', async () => {
        const loadWindows = jest.fn();
        const presentStandIn = jest.fn(async () => 'registered' as const);
        const window = shellPaymentWindow({
            sandbox: true,
            cardEntry: {} as CardEntryChannel,
            presentStandIn,
            loadWindows,
        });

        await expect(window(request('portone'))).resolves.toMatchObject({ outcome: 'registered' });
        expect(presentStandIn).toHaveBeenCalledWith(expect.objectContaining({ purpose: 'start' }));
        expect(loadWindows).not.toHaveBeenCalled();
    });

    it("opens the provider's window outside the sandbox: PortOne, or Stripe's card field", async () => {
        const portOneWindow = jest.fn(async () => ({ outcome: 'closed' as const }));
        const stripe = jest.fn(async () => ({ outcome: 'failed' as const }));
        const loadWindows = jest.fn(async () => ({ portOneWindow, createStripeWindow: () => stripe }));
        const window = shellPaymentWindow({
            sandbox: false,
            cardEntry: {} as CardEntryChannel,
            presentStandIn: jest.fn(),
            loadWindows: loadWindows as never,
        });

        await expect(window(request('portone'))).resolves.toEqual({ outcome: 'closed' });
        await expect(window(request('stripe'))).resolves.toEqual({ outcome: 'failed' });
        expect(portOneWindow).toHaveBeenCalledTimes(1);
        expect(stripe).toHaveBeenCalledTimes(1);
    });
});

describe('buyPlan', () => {
    it('registers a card, then starts the subscription with it', async () => {
        const port = {
            startPaymentMethodRegistration: jest.fn(async () => ({
                outcome: 'registered' as const,
                card: 'bk' as never,
            })),
            startCheckout: jest.fn(async () => ({ id: 'a', purpose: 'start' as const, status: 'succeeded' as const })),
        };
        await expect(buyPlan(port, { planId: 'pro-tier-01', country: 'US' })).resolves.toEqual({
            step: 'checkout',
            attempt: { id: 'a', purpose: 'start', status: 'succeeded' },
        });
        expect(port.startCheckout).toHaveBeenCalledWith({ planId: 'pro-tier-01', country: 'US', card: 'bk' });
    });

    it('stops at the card when it was not registered', async () => {
        const port = {
            startPaymentMethodRegistration: jest.fn(async () => ({ outcome: 'closed' as const })),
            startCheckout: jest.fn(),
        };
        await expect(buyPlan(port, { planId: 'pro-tier-01', country: 'KR' })).resolves.toEqual({
            step: 'card',
            outcome: 'closed',
        });
        expect(port.startCheckout).not.toHaveBeenCalled();
    });
});
