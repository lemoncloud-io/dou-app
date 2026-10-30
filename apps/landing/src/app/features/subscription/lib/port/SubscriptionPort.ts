import type {
    Account,
    AttemptPurpose,
    BillingEmail,
    BillingEmailReceives,
    BillingInfo,
    CardToken,
    ChangePlanResult,
    ChangePreview,
    CheckoutPreview,
    Currency,
    EmailCodeTicket,
    Invoice,
    PaymentAttempt,
    Payer,
    PaymentMethod,
    Plan,
    PlanId,
    RegistrationResult,
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

    // Plans and subscriptions. `currency` asks for the plans priced in it; without one they come in the
    // currency the subscription in force is charged in, or in won when there is none.
    listPlans(input?: { currency?: Currency }): Promise<Plan[]>;
    listSubscriptions(): Promise<Subscription[]>;
    getSubscription(id: string): Promise<Subscription>;

    // Checkout. `startPaymentMethodRegistration` stands where the payment provider's card entry opens;
    // the pages see its outcome, and carry the card it registered on to `startCheckout` without reading
    // it. Registering a card for anything but a checkout (`addCard`, `retry`) puts it on the
    // subscription there and then.
    //
    // Which provider registers and charges the card is the port's to decide, from the billing country
    // for a checkout (`KR` is billed in won, any other country in dollars) and from the subscription
    // for anything after; the pages never name one. The payer is given only where the country needs one
    // (`payerRequiredIn`) — a provider that requires a payer it was not given is refused as `invalid`.
    /** `currency` prices the preview — the billing country's at checkout; won when omitted. */
    previewCheckout(planId: PlanId, input?: { currency?: Currency }): Promise<CheckoutPreview>;
    startPaymentMethodRegistration(input: {
        purpose: AttemptPurpose;
        planId?: PlanId;
        /** The checkout's billing country; a card added later goes with the subscription's provider. */
        country?: string;
        payer?: Payer;
    }): Promise<RegistrationResult>;
    /**
     * Where a payment window that left the page comes back to — a phone's, which the provider opens by
     * going to its page and returning to ours with the result in the query. `callback` is that query;
     * the answer is what `startPaymentMethodRegistration` would have answered had the window stayed.
     */
    completePaymentMethodRegistration(input: {
        callback: URLSearchParams;
        purpose: AttemptPurpose;
        payer?: Payer;
    }): Promise<RegistrationResult>;
    startCheckout(input: {
        planId: PlanId;
        country: string;
        /** The verified billing email, where billing emails are managed; the payer's address is what is charged to. */
        emailId?: string;
        /** Where the billing country needs one. */
        payer?: Payer;
        /** The card `startPaymentMethodRegistration` registered for this checkout. */
        card?: CardToken;
    }): Promise<PaymentAttempt>;
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
