import type {
    Account,
    BillingInfo,
    Invoice,
    PaymentAttempt,
    PaymentMethod,
    PlanId,
    SignInProvider,
    Subscription,
} from '../../types';

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
] as const;

export type FailFlag = (typeof FAIL_FLAGS)[number];

/** What the stand-in consent page offers, and which of them it selects first. */
export type ConsentChoice = 'continue' | 'noAccount' | 'canceled' | 'expired';

/** A payment attempt plus what the mock needs to settle it later. */
export interface MockAttempt extends PaymentAttempt {
    /** Wall-clock milliseconds at which a `processing` attempt settles. */
    settleAt: number;
    /** How it settles. Decided when it starts, from the fail flag in force then. */
    settlesAs: 'succeeded' | 'failed';
    /** The plan an upgrade or a first checkout is for. */
    planId?: PlanId;
}

/** The whole mock server: one account and everything it owns. */
export interface MockState {
    /** Bumped when this shape changes, so a stored older shape is rebuilt rather than misread. */
    version: 2;
    scenario: ScenarioId;
    /** The mock's today, an ISO date. */
    today: string;
    fail: FailFlag | null;
    /** `&cards=0` — start the scenario with no payment method. */
    noCards: boolean;
    /** The dev scenario panel; `&panel=0` hides it for screenshots. */
    panelHidden: boolean;
    /** The query strings already applied, so the same URL is not applied twice (see `createMockPort`). */
    appliedSearches: string[];

    signedIn: boolean;
    /** Who a successful sign-in becomes. */
    account: Account;
    signIn: {
        provider: SignInProvider;
        defaultChoice: ConsentChoice;
        /** The masked address a provider shows when there is no linked account (Google only). */
        hint?: string;
    };
    pendingSignIn?: { nonce: string; provider: SignInProvider; next?: string; startedAt: number };

    subscriptions: Subscription[];
    paymentMethods: PaymentMethod[];
    invoices: Invoice[];
    billing: BillingInfo;
    attempts: MockAttempt[];
    failedCardAttempts: number;
    /** Counter behind every id the mock hands out. */
    seq: number;
}
