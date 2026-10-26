/**
 * The shapes the subscription screens draw.
 *
 * There is no web subscription server yet, so these are defined by what the screens need rather than
 * by a server DTO. The port implementation maps whatever the server returns into these; a field the
 * server cannot supply is a change to this file, not a workaround in a screen. The app's
 * `MembershipView` is not reused: web billing carries payment methods, invoices and billing emails
 * the app's model has no place for.
 *
 * Dates are ISO calendar dates (`2026-11-20`) unless a field says otherwise.
 */

/** The server's product id without its leading `#`. The display name is copy: `DoU Cloud {sort}`. */
export type PlanId = 'pro-tier-01' | 'pro-tier-02' | 'pro-tier-03' | 'pro-tier-04' | 'pro-tier-05';

/** An amount with VAT included. */
export interface Money {
    amount: number;
    currency: 'KRW' | 'USD';
}

export interface Plan {
    id: PlanId;
    sort: 1 | 2 | 3 | 4 | 5;
    maxClouds: number;
    monthly: Money;
    trialDays: number;
}

export type SignInProvider = 'google' | 'apple';

/** Who bills this account's subscription today. A store subscriber manages it in the store. */
export type BillingSource = 'none' | 'web' | 'appStore' | 'googlePlay';

export interface Account {
    id: string;
    provider: SignInProvider;
    /** Apple may not share one. */
    email?: string;
    /** A masked address to show when the full one is not available. */
    emailHint?: string;
    displayName?: string;
    billingSource: BillingSource;
    trialUsed: boolean;
    /** A store subscriber's plan and next charge, for the store notice. Absent for anyone else. */
    storeSubscription?: { planId: PlanId; nextBillingAt?: string };
}

export type SubscriptionStatus = 'trial' | 'active' | 'pastDue' | 'restricted' | 'cancelScheduled' | 'expired';

export interface Subscription {
    id: string;
    planId: PlanId;
    status: SubscriptionStatus;
    startedAt: string;
    /** Day of the month the subscription renews on. */
    billingDay: number;
    trialEndsAt?: string;
    nextBillingAt?: string;
    nextAmount?: Money;
    /** `pastDue` and `restricted` — where the D-Day comes from. */
    failedAt?: string;
    restrictAt?: string;
    /** Why the charge failed, in the payment provider's own words. */
    failureReason?: string;
    /** When the failed charge is retried. */
    retryAt?: string[];
    /** `cancelScheduled` and `expired`. */
    endsAt?: string;
    expiredAt?: string;
    /** `expired` — subscribing again before this day keeps the clouds that were held. */
    restoreUntil?: string;
    /** Why an ended subscription ended: cancelled, replaced by the next one, or a payment never recovered. */
    endedReason?: 'canceled' | 'replaced' | 'paymentFailed';
    /** A scheduled downgrade. Not a status: the subscription stays `active` until it applies. */
    pendingChange?: { planId: PlanId; effectiveAt: string };
    /** Subscribed again within the restore window after expiring. Also not a status. */
    restored?: boolean;
    defaultPaymentMethodId?: string;
}

export interface PaymentMethod {
    id: string;
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
    isDefault: boolean;
    expiringSoon: boolean;
}

export type InvoiceKind = 'first' | 'renewal' | 'upgrade' | 'retry' | 'refund';

export interface Invoice {
    id: string;
    issuedAt: string;
    kind: InvoiceKind;
    planId: PlanId;
    amount: Money;
    status: 'paid' | 'failed' | 'refunded';
    receiptUrl?: string;
}

export type BillingEmailReceives = Array<'receipt' | 'notice'>;

export interface BillingEmail {
    id: string;
    address: string;
    primary: boolean;
    status: 'verified' | 'pending' | 'bounced' | 'unsubscribed';
    receives: BillingEmailReceives;
}

export interface BillingInfo {
    country: string;
    emails: BillingEmail[];
}

export interface CheckoutPreview {
    plan: Plan;
    account: Account;
    withTrial: boolean;
    amountToday: Money;
    trialEndsAt?: string;
    firstChargeAt: string;
}

export interface ChangePreview {
    kind: 'upgrade' | 'downgrade';
    from: Plan;
    to: Plan;
    amountToday?: Money;
    effectiveAt: string;
    nextAmount: Money;
    blocked?: 'pastDue' | 'notAdjacent' | 'sameDayAsChange';
}

export type AttemptPurpose = 'start' | 'upgrade' | 'retry' | 'addCard';

export interface PaymentAttempt {
    id: string;
    purpose: AttemptPurpose;
    status: 'processing' | 'succeeded' | 'failed' | 'canceled';
    failure?: 'declined' | 'attemptLimit' | 'unknown';
    subscriptionId?: string;
    withTrial?: boolean;
}

export type SignInResult =
    | { account: Account; next?: string }
    | { noLinkedAccount: true; provider: SignInProvider; hint?: string };

export type ChangePlanResult = PaymentAttempt | { scheduled: true; effectiveAt: string };

export type RegistrationOutcome = 'registered' | 'failed' | 'closed';
