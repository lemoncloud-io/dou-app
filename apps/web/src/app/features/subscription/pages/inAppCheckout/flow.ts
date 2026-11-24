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

interface InAppPaymentOptions {
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

export const paymentWindowFor = ({
    sandbox,
    cardEntry,
    presentStandIn,
    loadWindows = loadProviderWindows,
}: Pick<InAppPaymentOptions, 'sandbox' | 'cardEntry' | 'presentStandIn' | 'loadWindows'>): PaymentWindow => {
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

export const createInAppPaymentPort = (options: InAppPaymentOptions): PaymentMethods =>
    createPaymentPort({
        api: options.api,
        session: { user: options.user },
        paymentWindow: paymentWindowFor(options),
        returnUrl: (_purpose, planId) => options.returnUrl(planId),
        sandbox: options.sandbox ? { interval: () => undefined } : undefined,
    });

export const mainUserOf = <User extends object>(user: User | null): User | null =>
    user && (user as { userRole?: unknown }).userRole !== 'guest' ? user : null;

export type InAppCheckoutOutcome =
    | { step: 'card'; outcome: 'failed' | 'closed' }
    | { step: 'checkout'; attempt: PaymentAttempt };

export const buyPlan = async (
    port: Pick<PaymentMethods, 'startPaymentMethodRegistration' | 'startCheckout'>,
    { planId, country, payer }: { planId: PlanId; country: string; payer?: Payer }
): Promise<InAppCheckoutOutcome> => {
    const card = await port.startPaymentMethodRegistration({ purpose: 'start', planId, country, payer });
    if (card.outcome !== 'registered') return { step: 'card', outcome: card.outcome };
    return { step: 'checkout', attempt: await port.startCheckout({ planId, country, payer, card: card.card }) };
};
