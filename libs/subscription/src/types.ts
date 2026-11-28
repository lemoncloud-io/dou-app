export type PlanId = 'pro-tier-01' | 'pro-tier-02' | 'pro-tier-03' | 'pro-tier-04' | 'pro-tier-05';

export type Currency = 'KRW' | 'USD';

export interface Money {
    amount: number;
    currency: Currency;
}

export type PaymentProvider = 'portone' | 'stripe';

export interface Plan {
    id: PlanId;
    sort: 1 | 2 | 3 | 4 | 5;
    maxClouds: number;
    monthly: Money;
    trialDays: number;
}

export type SignInProvider = 'google' | 'apple';

export type BillingSource = 'none' | 'web' | 'appStore' | 'googlePlay';

export interface Account {
    id: string;
    provider: SignInProvider;
    email?: string;
    emailHint?: string;
    displayName?: string;
    billingSource: BillingSource;
    trialUsed: boolean;
    trialEligible?: boolean;
    storeSubscription?: { planId: PlanId; nextBillingAt?: string };
}

export type SubscriptionStatus =
    | 'pending'
    | 'trial'
    | 'active'
    | 'pastDue'
    | 'restricted'
    | 'cancelScheduled'
    | 'expired';

export interface Subscription {
    id: string;
    planId: PlanId;
    status: SubscriptionStatus;
    startedAt: string;
    billingDay: number;
    trialEndsAt?: string;
    nextBillingAt?: string;
    nextAmount?: Money;
    failedAt?: string;
    restrictAt?: string;
    failureReason?: string;
    retryAt?: string[];
    endsAt?: string;
    expiredAt?: string;
    restoreUntil?: string;
    endedReason?: 'canceled' | 'replaced' | 'paymentFailed';
    pendingChange?: { planId: PlanId; effectiveAt: string };
    restored?: boolean;
    provider: PaymentProvider;
    defaultPaymentMethodId?: string;
}

export interface PaymentMethod {
    id: string;
    provider: PaymentProvider;
    brand: string;
    last4: string;
    expMonth?: number;
    expYear?: number;
    expiringSoon?: boolean;
    isDefault: boolean;
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

export interface EmailCodeTicket {
    emailId: string;
    expiresAt: string;
    resendAt: string;
    resendsLeft: number;
    attemptsLeft: number;
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
    blocked?: 'pastDue' | 'notAdjacent' | 'sameDayAsChange' | 'trialUpgrade';
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

export interface Payer {
    name: string;
    phone: string;
    email: string;
}

export type CardToken = string & { readonly __cardToken: unique symbol };

export type RegistrationResult = { outcome: 'registered'; card: CardToken } | { outcome: 'failed' | 'closed' };
