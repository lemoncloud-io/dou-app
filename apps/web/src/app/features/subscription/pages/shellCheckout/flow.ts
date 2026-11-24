import {
    createPaymentPort,
    createSandboxWindow,
    type CardEntryChannel,
    type PaymentAttempt,
    type PaymentMethods,
    type PaymentWindow,
    type PaymentWindowPresenter,
    type Payer,
    type PlanId,
    type SubscriptionApi,
} from '@chatic/web-checkout';

interface ProviderWindows {
    portOneWindow: PaymentWindow;
    createStripeWindow: (channel: CardEntryChannel) => PaymentWindow;
}

interface ShellPaymentOptions {
    api: SubscriptionApi;
    user: () => Record<string, unknown> | null;
    sandbox: boolean;
    cardEntry: CardEntryChannel;
    presentStandIn: PaymentWindowPresenter;
    returnUrl: (planId: PlanId | undefined) => string;
    loadWindows?: () => Promise<ProviderWindows>;
}

const loadProviderWindows = (): Promise<ProviderWindows> =>
    import('./providerWindows').then(module => module.providerWindows);

export const shellPaymentWindow = ({
    sandbox,
    cardEntry,
    presentStandIn,
    loadWindows = loadProviderWindows,
}: Pick<ShellPaymentOptions, 'sandbox' | 'cardEntry' | 'presentStandIn' | 'loadWindows'>): PaymentWindow => {
    if (sandbox) {
        const standIn = createSandboxWindow();
        standIn.host.setPaymentWindow(presentStandIn);
        return standIn.paymentWindow;
    }
    return async request => {
        const windows = await loadWindows();
        return request.issue.provider === 'stripe'
            ? windows.createStripeWindow(cardEntry)(request)
            : windows.portOneWindow(request);
    };
};

export const createShellPaymentPort = (options: ShellPaymentOptions): PaymentMethods =>
    createPaymentPort({
        api: options.api,
        session: { user: options.user },
        paymentWindow: shellPaymentWindow(options),
        returnUrl: (_purpose, planId) => options.returnUrl(planId),
        sandbox: options.sandbox ? { interval: () => undefined } : undefined,
    });

export type ShellCheckoutOutcome =
    | { step: 'card'; outcome: 'failed' | 'closed' }
    | { step: 'checkout'; attempt: PaymentAttempt };

export const buyPlan = async (
    port: Pick<PaymentMethods, 'startPaymentMethodRegistration' | 'startCheckout'>,
    { planId, country, payer }: { planId: PlanId; country: string; payer?: Payer }
): Promise<ShellCheckoutOutcome> => {
    const card = await port.startPaymentMethodRegistration({ purpose: 'start', planId, country, payer });
    if (card.outcome !== 'registered') return { step: 'card', outcome: card.outcome };
    return { step: 'checkout', attempt: await port.startCheckout({ planId, country, payer, card: card.card }) };
};
