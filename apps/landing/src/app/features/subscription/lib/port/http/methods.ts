import type { SubscriptionPort } from '../SubscriptionPort';

/**
 * The port methods the subscription server answers today: the sign-in, the plans, a subscription
 * and its checkout, plan change, cancelling, and the cards. The rest — billing emails, invoices,
 * undoing a cancellation or a scheduled downgrade, choosing the default card, retrying a failed
 * payment — have no server yet, and while the account surface is in development the mock answers them
 * (`composePort`). A method moves into this list the day its server exists.
 *
 * Kept apart from the implementation so that composing the two does not load the session runtime.
 */
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
    'startCheckout',
    'getPaymentAttempt',
    'previewChange',
    'changePlan',
    'cancelSubscription',
    'listPaymentMethods',
    'removePaymentMethod',
] as const satisfies ReadonlyArray<keyof SubscriptionPort>;

export type HttpMethod = (typeof HTTP_METHODS)[number];

export type HttpPort = Pick<SubscriptionPort, HttpMethod>;
