import { planCatalogIn } from './catalog';
import { SubscriptionPortError, type SubscriptionPort } from './port';

/** Nothing but the plans exists here, so every other call answers as it would for a visitor. */
const shut = (): Promise<never> =>
    Promise.reject(new SubscriptionPortError('unauthenticated', 'catalog only: nothing to sign in to'));

/**
 * The port where the account surface is shut (`isSubscriptionAccountEnabled`): a visitor who is never
 * signed in, looking at the published plans. It reads no URL, stores nothing and calls no server, so
 * the plans page can stand on the production host before there is a server to sign in to.
 */
export const createCatalogPort = (): SubscriptionPort => ({
    getSession: () => Promise.resolve(null),
    listPlans: input => Promise.resolve(planCatalogIn(input?.currency ?? 'KRW')),
    startSignIn: shut,
    completeSignIn: shut,
    signOut: shut,
    listSubscriptions: shut,
    getSubscription: shut,
    previewCheckout: shut,
    startPaymentMethodRegistration: shut,
    completePaymentMethodRegistration: shut,
    startCheckout: shut,
    getPaymentAttempt: shut,
    previewChange: shut,
    changePlan: shut,
    cancelScheduledChange: shut,
    cancelSubscription: shut,
    resumeSubscription: shut,
    listPaymentMethods: shut,
    setDefaultPaymentMethod: shut,
    removePaymentMethod: shut,
    retryPayment: shut,
    listInvoices: shut,
    getBillingInfo: shut,
    requestEmailCode: shut,
    resendEmailCode: shut,
    verifyEmailCode: shut,
    adoptSignInEmail: shut,
    replaceEmail: shut,
    setPrimaryEmail: shut,
    setEmailReceives: shut,
    removeEmail: shut,
});
