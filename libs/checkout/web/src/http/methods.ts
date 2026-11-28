import type { SubscriptionPort } from '../port/SubscriptionPort';

export const HTTP_METHODS = [
    'getSession',
    'startSignIn',
    'completeSignIn',
    'signOut',
    'listPlans',
    'listSubscriptions',
    'getSubscription',
    'previewCheckout',
    'startPaymentMethodRegistration',
    'completePaymentMethodRegistration',
    'startCheckout',
    'getPaymentAttempt',
    'previewChange',
    'changePlan',
    'cancelSubscription',
    'listPaymentMethods',
    'setDefaultPaymentMethod',
    'removePaymentMethod',
] as const satisfies ReadonlyArray<keyof SubscriptionPort>;

export type HttpMethod = (typeof HTTP_METHODS)[number];

export type HttpPort = Pick<SubscriptionPort, HttpMethod>;
