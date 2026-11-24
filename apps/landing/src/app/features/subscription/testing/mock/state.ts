import type {
    Account,
    BillingInfo,
    Invoice,
    PaymentAttempt,
    PaymentMethod,
    PaymentProvider,
    PlanId,
    SignInProvider,
    Subscription,
} from '@chatic/web-checkout';

export const SCENARIOS = [
    'visitor',
    'new',
    'new-trial-used',
    'no-linked-account',
    'no-linked-account-apple',
    'store-ios',
    'store-android',
    'trial',
    'active',
    'active-card-expiring',
    'past-due',
    'restricted',
    'cancel-scheduled',
    'downgrade-scheduled',
    'expired',
    'history-mixed',
    'email-pending',
    'new-apple',
] as const;

export type ScenarioId = (typeof SCENARIOS)[number];

export const FAIL_FLAGS = [
    'card-declined',
    'attempt-limit',
    'closed',
    'network',
    'signin-canceled',
    'signin-expired',
    'session-ended',
    'not-allowed',
    'code-expired',
    'resend-limit',
] as const;

export type FailFlag = (typeof FAIL_FLAGS)[number];

export type ConsentChoice = 'continue' | 'noAccount' | 'canceled' | 'expired';

export interface MockAttempt extends PaymentAttempt {
    settleAt: number;
    settlesAs: 'succeeded' | 'failed';
    planId?: PlanId;
    provider?: PaymentProvider;
}

export interface MockEmailCode {
    sentAt: number;
    expiresAt: number;
    attemptsLeft: number;
    resendsLeft: number;
    lockedUntil?: number;
}

export interface MockState {
    version: 4;
    scenario: ScenarioId;
    today: string;
    fail: FailFlag | null;
    noCards: boolean;
    appliedSearches: string[];

    signedIn: boolean;
    account: Account;
    signIn: {
        defaultChoice: ConsentChoice;
        hint?: string;
    };
    pendingSignIn?: { nonce: string; provider: SignInProvider; next?: string; startedAt: number };

    subscriptions: Subscription[];
    paymentMethods: PaymentMethod[];
    invoices: Invoice[];
    billing: BillingInfo;
    emailCodes: Record<string, MockEmailCode>;
    attempts: MockAttempt[];
    failedCardAttempts: number;
    seq: number;
}
