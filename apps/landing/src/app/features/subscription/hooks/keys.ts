export const subscriptionKeys = {
    all: ['subscription'] as const,
    session: () => ['subscription', 'getSession'] as const,
    plans: (currency?: string) => ['subscription', 'listPlans', currency ?? ''] as const,
    subscriptions: () => ['subscription', 'listSubscriptions'] as const,
    subscription: (id: string) => ['subscription', 'getSubscription', id] as const,
    checkoutPreview: (planId: string, currency?: string) =>
        ['subscription', 'previewCheckout', planId, currency ?? ''] as const,
    paymentAttempt: (id: string) => ['subscription', 'getPaymentAttempt', id] as const,
    changePreview: (planId: string) => ['subscription', 'previewChange', planId] as const,
    paymentMethods: () => ['subscription', 'listPaymentMethods'] as const,
    invoices: () => ['subscription', 'listInvoices'] as const,
    billingInfo: () => ['subscription', 'getBillingInfo'] as const,
};
