/**
 * Query keys: `['subscription', <port method>, ...arguments]`. The shared first element is what lets a
 * sign-out drop every cached answer at once.
 */
export const subscriptionKeys = {
    all: ['subscription'] as const,
    session: () => ['subscription', 'getSession'] as const,
    plans: () => ['subscription', 'listPlans'] as const,
    subscriptions: () => ['subscription', 'listSubscriptions'] as const,
    subscription: (id: string) => ['subscription', 'getSubscription', id] as const,
    checkoutPreview: (planId: string) => ['subscription', 'previewCheckout', planId] as const,
    paymentAttempt: (id: string) => ['subscription', 'getPaymentAttempt', id] as const,
    changePreview: (planId: string) => ['subscription', 'previewChange', planId] as const,
    paymentMethods: () => ['subscription', 'listPaymentMethods'] as const,
    invoices: () => ['subscription', 'listInvoices'] as const,
    billingInfo: () => ['subscription', 'getBillingInfo'] as const,
};
