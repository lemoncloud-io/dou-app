import type { SubscriptionPort } from '../SubscriptionPort';

/**
 * The port methods the subscription server answers today: the sign-in, the plans, a subscription
 * and its checkout, plan change, cancelling, and the cards — adding one, choosing the default,
 * removing one. The rest — billing emails, invoices, undoing a cancellation or a scheduled downgrade,
 * retrying a failed payment — have no server yet: against the server they refuse, and the screens leave out what would
 * call them (`PortSupports`). A method moves into this list the day its server exists.
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
