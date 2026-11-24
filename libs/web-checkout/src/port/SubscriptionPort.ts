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
} from '../types';

export interface SubscriptionPort {
    getSession(): Promise<Account | null>;
    startSignIn(input: { provider: SignInProvider; next?: string }): Promise<{ redirectUrl: string }>;
    completeSignIn(callback: URLSearchParams): Promise<SignInResult>;
    signOut(): Promise<void>;

    listPlans(input?: { currency?: Currency }): Promise<Plan[]>;
    listSubscriptions(): Promise<Subscription[]>;
    getSubscription(id: string): Promise<Subscription>;

    previewCheckout(planId: PlanId, input?: { currency?: Currency }): Promise<CheckoutPreview>;
    startPaymentMethodRegistration(input: {
        purpose: AttemptPurpose;
        planId?: PlanId;
        country?: string;
        payer?: Payer;
    }): Promise<RegistrationResult>;
    completePaymentMethodRegistration(input: {
        callback: URLSearchParams;
        purpose: AttemptPurpose;
        payer?: Payer;
    }): Promise<RegistrationResult>;
    startCheckout(input: {
        planId: PlanId;
        country: string;
        emailId?: string;
        payer?: Payer;
        card?: CardToken;
    }): Promise<PaymentAttempt>;
    getPaymentAttempt(id: string): Promise<PaymentAttempt>;
    previewChange(planId: PlanId): Promise<ChangePreview>;
    changePlan(planId: PlanId): Promise<ChangePlanResult>;
    cancelScheduledChange(subscriptionId: string): Promise<Subscription>;

    cancelSubscription(subscriptionId: string): Promise<Subscription>;
    resumeSubscription(subscriptionId: string): Promise<Subscription>;

    listPaymentMethods(): Promise<PaymentMethod[]>;
    setDefaultPaymentMethod(id: string): Promise<PaymentMethod[]>;
    removePaymentMethod(id: string): Promise<PaymentMethod[]>;
    retryPayment(subscriptionId: string): Promise<PaymentAttempt>;

    listInvoices(): Promise<Invoice[]>;
    getBillingInfo(): Promise<BillingInfo>;
    requestEmailCode(address: string): Promise<EmailCodeTicket>;
    resendEmailCode(emailId: string): Promise<EmailCodeTicket>;
    verifyEmailCode(emailId: string, code: string): Promise<BillingEmail>;
    adoptSignInEmail(): Promise<BillingEmail>;
    replaceEmail(emailId: string, newEmailId: string): Promise<BillingInfo>;
    setPrimaryEmail(emailId: string): Promise<BillingInfo>;
    setEmailReceives(emailId: string, receives: BillingEmailReceives): Promise<BillingInfo>;
    removeEmail(emailId: string): Promise<BillingInfo>;
}
