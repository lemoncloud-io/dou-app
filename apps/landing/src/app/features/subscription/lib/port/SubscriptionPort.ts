import type {
    Account,
    AttemptPurpose,
    BillingEmail,
    BillingEmailReceives,
    BillingInfo,
    ChangePlanResult,
    ChangePreview,
    CheckoutPreview,
    EmailCodeTicket,
    Invoice,
    PaymentAttempt,
    PaymentMethod,
    Plan,
    PlanId,
    RegistrationOutcome,
    SignInProvider,
    SignInResult,
    Subscription,
} from '../../types';

/**
 * Everything the subscription screens ask of a server, in one interface.
 *
 * Pages and hooks talk to this and nothing else — no `fetch`, no HTTP client. Today the only
 * implementation is the in-memory mock (`lib/mock`); the real one will be a second implementation of
 * the same interface, and swapping it in is meant to touch `lib/port/` and nothing under `pages/`.
 *
 * Every method rejects with a `SubscriptionPortError` (see `errors.ts`) and nothing else.
 */
export interface SubscriptionPort {
    // Session. Sign-in is a redirect round trip: `startSignIn` hands back the provider's address to
    // leave for, and the provider sends the browser back to the callback page, which passes its query
    // to `completeSignIn`.
    getSession(): Promise<Account | null>;
    startSignIn(input: { provider: SignInProvider; next?: string }): Promise<{ redirectUrl: string }>;
    completeSignIn(callback: URLSearchParams): Promise<SignInResult>;
    signOut(): Promise<void>;

    // Plans and subscriptions.
    listPlans(): Promise<Plan[]>;
    listSubscriptions(): Promise<Subscription[]>;
    getSubscription(id: string): Promise<Subscription>;

    // Checkout. `startPaymentMethodRegistration` stands where the payment provider's own window
    // opens; the pages only ever see its outcome.
    previewCheckout(planId: PlanId): Promise<CheckoutPreview>;
    startPaymentMethodRegistration(input: {
        purpose: AttemptPurpose;
        planId?: PlanId;
    }): Promise<{ outcome: RegistrationOutcome }>;
    startCheckout(input: { planId: PlanId; country: string; emailId: string }): Promise<PaymentAttempt>;
    getPaymentAttempt(id: string): Promise<PaymentAttempt>;
    previewChange(planId: PlanId): Promise<ChangePreview>;
    changePlan(planId: PlanId): Promise<ChangePlanResult>;
    cancelScheduledChange(subscriptionId: string): Promise<Subscription>;

    // Cancellation.
    cancelSubscription(subscriptionId: string): Promise<Subscription>;
    resumeSubscription(subscriptionId: string): Promise<Subscription>;

    // Payment methods.
    listPaymentMethods(): Promise<PaymentMethod[]>;
    setDefaultPaymentMethod(id: string): Promise<PaymentMethod[]>;
    removePaymentMethod(id: string): Promise<PaymentMethod[]>;
    retryPayment(subscriptionId: string): Promise<PaymentAttempt>;

    // Billing.
    listInvoices(): Promise<Invoice[]>;
    getBillingInfo(): Promise<BillingInfo>;
    /** Sends a code to a new address (or a fresh one to an address still waiting). */
    requestEmailCode(address: string): Promise<EmailCodeTicket>;
    resendEmailCode(emailId: string): Promise<EmailCodeTicket>;
    verifyEmailCode(emailId: string, code: string): Promise<BillingEmail>;
    /** Uses the Google sign-in address as a billing address without a code. */
    adoptSignInEmail(): Promise<BillingEmail>;
    /** A verified new address takes an old one's place: its primary mark and what it receives. */
    replaceEmail(emailId: string, newEmailId: string): Promise<BillingInfo>;
    setPrimaryEmail(emailId: string): Promise<BillingInfo>;
    setEmailReceives(emailId: string, receives: BillingEmailReceives): Promise<BillingInfo>;
    removeEmail(emailId: string): Promise<BillingInfo>;
}
