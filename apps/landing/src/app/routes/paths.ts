/**
 * Every absolute path this site links or redirects to.
 *
 * A `<Link to>` or `<Navigate to>` takes its target from here instead of a typed string. These are
 * public URLs that store listings, the sitemap and links already sent to people cite, so a value
 * here changes only together with everything outside the repo that points at it.
 *
 * The route table itself (`CommonRoutes.tsx`) and each feature's own `routes/` still spell their
 * patterns (`policy/*`, `/terms`), the same split the web app keeps: a pattern is matched, a
 * path from here is navigated to.
 */
export const ROUTES = {
    root: '/',
    policy: {
        terms: '/policy/terms',
        privacy: '/policy/privacy',
        child: '/policy/child',
        refund: '/policy/refund',
    },
    /**
     * The signed-in subscription pages. Registered only where `isSubscriptionAccountEnabled` holds
     * (`app/config/stage.ts`), so on the production host every one of these is the catch-all — except
     * `plans`, which lists the plans on every host.
     */
    subscription: {
        /** W-10, the subscription list — where a signed-in visitor lands by default. */
        root: '/subscription',
        plans: '/subscription/plans',
        login: '/subscription/login',
        loginCallback: '/subscription/login/callback',
        noLinkedAccount: '/subscription/login/no-account',
        /** The mock port's stand-in for a social provider's consent page. */
        mockProvider: '/subscription/login/mock-provider',
        /** The mock port's stand-in for a provider-hosted receipt. */
        mockReceipt: '/subscription/mock-receipt',
        storeManaged: '/subscription/store-managed',
        /** W-24, the email step every first checkout goes through before W-08. */
        checkoutEmail: '/subscription/checkout/email',
        checkout: '/subscription/checkout',
        checkoutPayment: '/subscription/checkout/payment',
        checkoutStatus: '/subscription/checkout/status',
        checkoutComplete: '/subscription/checkout/complete',
        change: '/subscription/change',
        paymentMethods: '/subscription/payment-methods',
        history: '/subscription/history',
        billingInfo: '/subscription/billing-info',
        detail: (subscriptionId: string) => `/subscription/${encodeURIComponent(subscriptionId)}`,
        cancel: (subscriptionId: string) => `/subscription/${encodeURIComponent(subscriptionId)}/cancel`,
    },
} as const;
