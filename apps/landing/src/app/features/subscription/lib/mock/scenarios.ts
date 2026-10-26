import { ROUTES } from '../../../../routes/paths';
import { addDays } from '../calendar';
import { MOCK_POLICY, planOf } from './policy';

import type { ConsentChoice, MockState, ScenarioId } from './state';
import type { Account, BillingEmail, Invoice, PaymentMethod, PlanId, Subscription } from '../../types';

/**
 * The account and its data for each `?mock=` scenario.
 *
 * Dates are fixed, not computed from today: a scenario is a picture of one moment, and `?now=` moves
 * the mock's today across it — which is how the same-day cases are reached (`?mock=downgrade-scheduled
 * &now=2026-11-20` is the day the downgrade applies).
 */
export const DEFAULT_TODAY = '2026-11-01';

/** Where the mock points a receipt link: a stand-in page, mock-only like the consent page. */
export const mockReceiptUrl = (invoiceId: string): string =>
    `${ROUTES.subscription.mockReceipt}?invoice=${encodeURIComponent(invoiceId)}`;

const price = (planId: PlanId) => planOf(planId).monthly;

/** The retry days after a failed charge, from the policy. */
const retriesAfter = (failedAt: string) => MOCK_POLICY.retryAfterDays.map(days => addDays(failedAt, days));

/** The last day subscribing again restores the held clouds, from the policy. */
const restoreUntil = (expiredAt: string) => addDays(expiredAt, MOCK_POLICY.restoreWindowDays);

/** The payment provider's decline text, kept as it would arrive. */
const DECLINE_REASON = '카드 한도 초과';

const ACCOUNT: Account = {
    id: 'acc-1',
    provider: 'google',
    email: 'minji.kim@gmail.com',
    displayName: 'Minji Kim',
    billingSource: 'web',
    trialUsed: true,
};

const CARDS: PaymentMethod[] = [
    { id: 'pm-1', brand: '신한', last4: '1234', expMonth: 4, expYear: 2029, isDefault: true, expiringSoon: false },
    { id: 'pm-2', brand: '현대', last4: '5678', expMonth: 8, expYear: 2028, isDefault: false, expiringSoon: false },
];

const PRIMARY_EMAIL: BillingEmail = {
    id: 'em-1',
    address: 'minji.kim@gmail.com',
    primary: true,
    status: 'verified',
    receives: ['receipt', 'notice'],
};

const invoice = (
    id: string,
    issuedAt: string,
    kind: Invoice['kind'],
    planId: PlanId,
    status: Invoice['status'],
    amount = price(planId)
): Invoice => ({
    id,
    issuedAt,
    kind,
    planId,
    amount,
    status,
    receiptUrl: status === 'failed' ? undefined : mockReceiptUrl(id),
});

/** Cloud 2, renewing on the 20th — the subscription most of the designs draw. */
const activeCloud2 = (overrides: Partial<Subscription> = {}): Subscription => ({
    id: 'sub-2',
    planId: 'pro-tier-02',
    status: 'active',
    startedAt: '2026-09-20',
    billingDay: 20,
    nextBillingAt: '2026-11-20',
    nextAmount: price('pro-tier-02'),
    defaultPaymentMethodId: 'pm-1',
    ...overrides,
});

/** The Cloud 1 subscription that ended before Cloud 2 began. */
const endedCloud1: Subscription = {
    id: 'sub-1',
    planId: 'pro-tier-01',
    status: 'expired',
    startedAt: '2026-08-20',
    billingDay: 20,
    endsAt: '2026-09-19',
    expiredAt: '2026-09-19',
    restoreUntil: restoreUntil('2026-09-19'),
    endedReason: 'replaced',
};

const ACTIVE_INVOICES = [
    invoice('inv-2', '2026-10-20', 'renewal', 'pro-tier-02', 'paid'),
    invoice('inv-1', '2026-09-20', 'first', 'pro-tier-02', 'paid'),
];

interface ScenarioData {
    signedIn: boolean;
    account: Account;
    signIn?: { provider?: Account['provider']; defaultChoice?: ConsentChoice; hint?: string };
    subscriptions?: Subscription[];
    paymentMethods?: PaymentMethod[];
    invoices?: Invoice[];
    emails?: BillingEmail[];
}

const NEW_ACCOUNT: Account = { ...ACCOUNT, billingSource: 'none', trialUsed: false };

const SCENARIO_DATA: Record<ScenarioId, () => ScenarioData> = {
    visitor: () => ({ signedIn: false, account: NEW_ACCOUNT }),
    new: () => ({ signedIn: true, account: NEW_ACCOUNT }),
    'new-trial-used': () => ({ signedIn: true, account: { ...NEW_ACCOUNT, trialUsed: true } }),
    'no-linked-account': () => ({
        signedIn: false,
        account: NEW_ACCOUNT,
        signIn: { provider: 'google', defaultChoice: 'noAccount', hint: 'mi***@gmail.com' },
    }),
    'no-linked-account-apple': () => ({
        signedIn: false,
        account: { ...NEW_ACCOUNT, provider: 'apple', email: undefined },
        signIn: { provider: 'apple', defaultChoice: 'noAccount' },
    }),
    'store-ios': () => ({
        signedIn: true,
        account: {
            ...ACCOUNT,
            billingSource: 'appStore',
            storeSubscription: { planId: 'pro-tier-02', nextBillingAt: '2026-11-03' },
        },
    }),
    'store-android': () => ({
        signedIn: true,
        account: {
            ...ACCOUNT,
            billingSource: 'googlePlay',
            storeSubscription: { planId: 'pro-tier-02', nextBillingAt: '2026-11-03' },
        },
    }),
    trial: () => ({
        signedIn: true,
        account: ACCOUNT,
        subscriptions: [
            {
                id: 'sub-3',
                planId: 'pro-tier-01',
                status: 'trial',
                startedAt: '2026-10-30',
                billingDay: 6,
                trialEndsAt: '2026-11-06',
                nextBillingAt: '2026-11-06',
                nextAmount: price('pro-tier-01'),
                defaultPaymentMethodId: 'pm-1',
            },
        ],
        paymentMethods: [CARDS[0]],
        invoices: [],
    }),
    active: () => ({
        signedIn: true,
        account: ACCOUNT,
        subscriptions: [activeCloud2(), endedCloud1],
        paymentMethods: CARDS,
        invoices: ACTIVE_INVOICES,
    }),
    'active-card-expiring': () => ({
        signedIn: true,
        account: ACCOUNT,
        subscriptions: [activeCloud2()],
        paymentMethods: [{ ...CARDS[0], expMonth: 11, expYear: 2026, expiringSoon: true }, CARDS[1]],
        invoices: ACTIVE_INVOICES,
    }),
    // The October renewal failed on the 30th; today (1 November) is D+2.
    'past-due': () => ({
        signedIn: true,
        account: ACCOUNT,
        subscriptions: [
            activeCloud2({
                status: 'pastDue',
                billingDay: 30,
                startedAt: '2026-09-30',
                nextBillingAt: undefined,
                failedAt: '2026-10-30',
                restrictAt: '2026-11-06',
                failureReason: DECLINE_REASON,
                retryAt: retriesAfter('2026-10-30'),
            }),
        ],
        paymentMethods: [CARDS[0]],
        invoices: [
            invoice('inv-3', '2026-10-30', 'renewal', 'pro-tier-02', 'failed'),
            invoice('inv-1', '2026-09-30', 'first', 'pro-tier-02', 'paid'),
        ],
    }),
    // Failed on 24 October; access was restricted on the 31st, so today is D+8.
    restricted: () => ({
        signedIn: true,
        account: ACCOUNT,
        subscriptions: [
            activeCloud2({
                status: 'restricted',
                billingDay: 24,
                startedAt: '2026-09-24',
                nextBillingAt: undefined,
                failedAt: '2026-10-24',
                restrictAt: '2026-10-31',
                failureReason: DECLINE_REASON,
                retryAt: retriesAfter('2026-10-24'),
            }),
        ],
        paymentMethods: [CARDS[0]],
        invoices: [
            invoice('inv-3', '2026-10-24', 'renewal', 'pro-tier-02', 'failed'),
            invoice('inv-1', '2026-09-24', 'first', 'pro-tier-02', 'paid'),
        ],
    }),
    'cancel-scheduled': () => ({
        signedIn: true,
        account: ACCOUNT,
        subscriptions: [
            activeCloud2({
                status: 'cancelScheduled',
                endsAt: '2026-11-20',
                nextBillingAt: undefined,
                nextAmount: undefined,
            }),
        ],
        paymentMethods: CARDS,
        invoices: ACTIVE_INVOICES,
    }),
    // Cloud 3 drops to Cloud 2 on the next renewal, which then charges the Cloud 2 price.
    'downgrade-scheduled': () => ({
        signedIn: true,
        account: ACCOUNT,
        subscriptions: [
            activeCloud2({
                id: 'sub-4',
                planId: 'pro-tier-03',
                nextAmount: price('pro-tier-02'),
                pendingChange: { planId: 'pro-tier-02', effectiveAt: '2026-11-20' },
            }),
        ],
        paymentMethods: CARDS,
        invoices: [
            invoice('inv-2', '2026-10-20', 'renewal', 'pro-tier-03', 'paid'),
            invoice('inv-1', '2026-09-20', 'first', 'pro-tier-03', 'paid'),
        ],
    }),
    // Ended on 20 October: subscribing again before 19 November restores the held clouds.
    expired: () => ({
        signedIn: true,
        account: ACCOUNT,
        subscriptions: [
            activeCloud2({
                status: 'expired',
                nextBillingAt: undefined,
                nextAmount: undefined,
                endsAt: '2026-10-20',
                expiredAt: '2026-10-20',
                restoreUntil: restoreUntil('2026-10-20'),
                endedReason: 'canceled',
            }),
        ],
        paymentMethods: [CARDS[0]],
        invoices: [invoice('inv-1', '2026-09-20', 'first', 'pro-tier-02', 'paid')],
    }),
    // One subscription of each ending beside the current one, for the list's per-status cards.
    'history-mixed': () => ({
        signedIn: true,
        account: ACCOUNT,
        subscriptions: [
            activeCloud2(),
            endedCloud1,
            {
                id: 'sub-0',
                planId: 'pro-tier-01',
                status: 'expired',
                startedAt: '2026-05-10',
                billingDay: 10,
                failedAt: '2026-07-10',
                endsAt: '2026-07-17',
                expiredAt: '2026-07-17',
                restoreUntil: restoreUntil('2026-07-17'),
                endedReason: 'paymentFailed',
            },
        ],
        paymentMethods: CARDS,
        invoices: [
            invoice('inv-6', '2026-10-25', 'refund', 'pro-tier-01', 'refunded', { amount: -8600, currency: 'KRW' }),
            invoice('inv-5', '2026-10-21', 'retry', 'pro-tier-02', 'paid'),
            invoice('inv-4', '2026-10-20', 'renewal', 'pro-tier-02', 'failed'),
            invoice('inv-3', '2026-10-05', 'upgrade', 'pro-tier-02', 'paid', { amount: 4590, currency: 'KRW' }),
            invoice('inv-2', '2026-09-20', 'first', 'pro-tier-01', 'paid'),
            invoice('inv-1', '2026-08-20', 'first', 'pro-tier-01', 'paid'),
        ],
    }),
    'email-pending': () => ({
        signedIn: true,
        account: ACCOUNT,
        subscriptions: [activeCloud2()],
        paymentMethods: CARDS,
        invoices: ACTIVE_INVOICES,
        emails: [
            { ...PRIMARY_EMAIL, status: 'bounced' },
            { id: 'em-2', address: 'billing@lemon.example', primary: false, status: 'pending', receives: ['receipt'] },
        ],
    }),
};

/** A fresh mock state for a scenario. */
export const buildScenario = (
    scenario: ScenarioId,
    options: { today?: string; noCards?: boolean; panelHidden?: boolean } = {}
): MockState => {
    const data = SCENARIO_DATA[scenario]();
    const paymentMethods = options.noCards ? [] : (data.paymentMethods ?? []);
    const subscriptions = (data.subscriptions ?? []).map(sub =>
        options.noCards ? { ...sub, defaultPaymentMethodId: undefined } : sub
    );
    const hasWebHistory = subscriptions.length > 0;
    return {
        version: 2,
        scenario,
        today: options.today ?? DEFAULT_TODAY,
        fail: null,
        noCards: !!options.noCards,
        panelHidden: !!options.panelHidden,
        appliedSearches: [],
        signedIn: data.signedIn,
        account: data.account,
        signIn: {
            provider: data.signIn?.provider ?? data.account.provider,
            defaultChoice: data.signIn?.defaultChoice ?? 'continue',
            hint: data.signIn?.hint,
        },
        subscriptions,
        paymentMethods,
        invoices: data.invoices ?? [],
        billing: {
            country: 'KR',
            emails: data.emails ?? (hasWebHistory ? [PRIMARY_EMAIL] : []),
        },
        attempts: [],
        failedCardAttempts: 0,
        seq: 100,
    };
};

export const isScenario = (value: string | null): value is ScenarioId =>
    !!value && (Object.keys(SCENARIO_DATA) as string[]).includes(value);
