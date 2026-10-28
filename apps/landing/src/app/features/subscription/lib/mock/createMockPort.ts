import { ROUTES } from '../../../../routes/paths';
import { addDays, addMonths, dayNumber } from '../calendar';
import { canRemovePaymentMethod } from '../canRemovePaymentMethod';
import { changeKindOf } from '../changeKindOf';
import { isLive } from '../sceneOf';
import { SubscriptionPortError, type SubscriptionPortErrorDetail } from '../port/errors';
import { MOCK_PLANS, MOCK_POLICY, planOf } from './policy';
import { buildScenario, isScenario, mockReceiptUrl } from './scenarios';
import {
    type ConsentChoice,
    FAIL_FLAGS,
    type FailFlag,
    type MockAttempt,
    type MockEmailCode,
    type MockState,
    type ScenarioId,
} from './state';
import { type StateStore, sessionStateStore } from './storage';

import type { Clock, SubscriptionPort } from '../port';
import type {
    AttemptPurpose,
    BillingEmail,
    CardToken,
    ChangePreview,
    EmailCodeTicket,
    Money,
    Payer,
    PaymentAttempt,
    PaymentMethod,
    PlanId,
    RegistrationOutcome,
    RegistrationResult,
    Subscription,
} from '../../types';

/** The dev panel's and the consent page's handle on the mock — never used by a real screen. */
export interface MockController {
    /** Reads the URL first (see `createMockPort`), so it may commit — never call it during render. */
    getState(): MockState;
    /** The state as it is, without reading the URL — safe during render. */
    peek(): MockState;
    subscribe(listener: () => void): () => void;
    /** Rebuild the current scenario from scratch, at its own today, with no fail flag. */
    reset(): void;
    setScenario(scenario: ScenarioId): void;
    setFail(fail: FailFlag | null): void;
    /** `null` goes back to the scenario's own today. */
    setToday(today: string | null): void;
    setPanelHidden(hidden: boolean): void;
    /** Registers the stand-in payment window that answers `startPaymentMethodRegistration`. */
    setPaymentWindow(presenter: PaymentWindowPresenter | null): void;
}

/** One request to the stand-in payment window, and the outcome the reader picks. */
export interface PaymentWindowRequest {
    purpose: AttemptPurpose;
    planId?: PlanId;
    /** The outcome the current fail flag implies — the window's preselected answer. */
    suggested: RegistrationOutcome;
}

export type PaymentWindowPresenter = (request: PaymentWindowRequest) => Promise<RegistrationOutcome>;

export interface MockSetup {
    port: SubscriptionPort;
    controller: MockController;
    clock: Clock;
}

export interface MockOptions {
    store?: StateStore;
    /** The query string the scenario is read from; the page's own by default. */
    readSearch?: () => string;
    /** Latency of every call. */
    delayMs?: number;
    /** How long a payment attempt stays `processing`. */
    settleMs?: number;
    /** Wall clock, for settling attempts and timing out sign-ins. */
    nowMs?: () => number;
    nonce?: () => string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The query parameters the mock reads; any other query leaves it alone. */
const MOCK_PARAMS = ['mock', 'fail', 'now', 'cards', 'panel'];

const APPLIED_SEARCHES_KEPT = 50;

const clone = <T>(value: T): T => (value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T));

const fail = (code: SubscriptionPortError['code'], message?: string, detail?: SubscriptionPortErrorDetail): never => {
    throw new SubscriptionPortError(code, message, detail);
};

const isFailFlag = (value: string | null): value is FailFlag =>
    !!value && (FAIL_FLAGS as readonly string[]).includes(value);

const isCompletePayer = (payer: Payer | undefined): boolean =>
    !!payer && !!payer.name.trim() && !!payer.phone.trim() && !!payer.email.trim();

const publicAttempt = ({ settleAt: _s, settlesAs: _a, planId: _p, ...attempt }: MockAttempt): PaymentAttempt => attempt;

// A rough proration for the mock: the price difference for the days left in the current period,
// rounded down to ten won. The real figure is the payment provider's.
const prorate = (from: Money, to: Money, today: string, nextBillingAt: string | undefined): Money => {
    const diff = to.amount - from.amount;
    if (!nextBillingAt) return { amount: diff, currency: to.currency };
    const periodStart = addMonths(nextBillingAt, -1);
    const period = Math.max(1, dayNumber(nextBillingAt) - dayNumber(periodStart));
    const left = Math.max(0, dayNumber(nextBillingAt) - dayNumber(today));
    return { amount: Math.floor((diff * left) / period / 10) * 10, currency: to.currency };
};

const CARD_BRANDS = ['국민', '삼성', '롯데', '하나'];

/**
 * An in-memory subscription server behind the real port interface.
 *
 * It holds one account's state, picked by `?mock=<scenario>`, and every method changes that state the
 * way the server would — cancelling schedules an end, a successful upgrade changes the plan — so a
 * flow can be walked end to end. It decides nothing about what a screen shows: that is `lib/`'s.
 *
 * The URL is read at the start of every call, and each query is applied once: a reload keeps the
 * state it had, a one-shot `&fail=` is spent once, and opening a different `?mock=` starts that
 * scenario over.
 */
export const createMockPort = (options: MockOptions = {}): MockSetup => {
    const store = options.store ?? sessionStateStore();
    const readSearch = options.readSearch ?? (() => window.location.search);
    const delayMs = options.delayMs ?? 300;
    const settleMs = options.settleMs ?? 1500;
    const nowMs = options.nowMs ?? (() => Date.now());
    const nonce = options.nonce ?? (() => Math.random().toString(36).slice(2, 10));

    const listeners = new Set<() => void>();
    let paymentWindow: PaymentWindowPresenter | null = null;

    const stored = store.load();
    let state: MockState = stored && stored.version === 3 ? stored : buildScenario('visitor');

    const commit = (next: MockState) => {
        state = next;
        store.save(state);
        listeners.forEach(listener => listener());
    };

    const syncFromUrl = () => {
        const search = readSearch();
        const params = new URLSearchParams(search);
        // A query with none of the mock's own parameters says nothing to it.
        if (!MOCK_PARAMS.some(name => params.has(name))) return;
        // Applied once per page session. A sign-in returning to `next` comes back to the very query
        // that started it; applying a one-shot `fail=session-ended` there again would end the new
        // session as well, round and round.
        if (state.appliedSearches.includes(search)) return;
        const scenario = params.get('mock');
        const cards = params.get('cards');
        let next = clone(state);
        if (isScenario(scenario)) {
            const noCards = cards === '0';
            if (scenario !== state.scenario || noCards !== state.noCards) {
                next = buildScenario(scenario, { noCards, panelHidden: state.panelHidden });
            }
        }
        const today = params.get('now');
        if (today && ISO_DATE.test(today)) next.today = today;
        if (params.has('fail')) next.fail = isFailFlag(params.get('fail')) ? (params.get('fail') as FailFlag) : null;
        if (params.get('panel') === '0') next.panelHidden = true;
        if (params.get('panel') === '1') next.panelHidden = false;
        next.appliedSearches = [...state.appliedSearches, search].slice(-APPLIED_SEARCHES_KEPT);
        commit(next);
    };

    const nextId = (s: MockState, prefix: string) => `${prefix}-${++s.seq}`;

    const liveSubscription = (s: MockState): Subscription | undefined => s.subscriptions.find(isLive);

    const findSubscription = (s: MockState, id: string): Subscription =>
        s.subscriptions.find(sub => sub.id === id) ?? fail('notFound', `no subscription ${id}`);

    const defaultCard = (s: MockState): PaymentMethod | undefined => s.paymentMethods.find(pm => pm.isDefault);

    const ticketOf = (emailId: string, sent: MockEmailCode): EmailCodeTicket => ({
        emailId,
        expiresAt: new Date(sent.expiresAt).toISOString(),
        resendAt: new Date(sent.sentAt + MOCK_POLICY.emailResendSeconds * 1000).toISOString(),
        resendsLeft: sent.resendsLeft,
        attemptsLeft: sent.attemptsLeft,
    });

    // Sends a code to an address, applying the resend rules: not again within the interval, and once
    // the codes run out, a lock before the address can start over.
    const sendCode = (s: MockState, emailId: string): EmailCodeTicket => {
        const now = nowMs();
        const previous = s.emailCodes[emailId];
        const lockedUntil = previous?.lockedUntil;
        if (lockedUntil && now < lockedUntil) {
            fail('resendLimit', undefined, { retryAt: new Date(lockedUntil).toISOString() });
        }
        const lockedOut = (until: number) => {
            s.emailCodes[emailId] = { ...(previous as MockEmailCode), lockedUntil: until };
            commit(clone(s));
            fail('resendLimit', undefined, { retryAt: new Date(until).toISOString() });
        };
        if (previous && s.fail === 'resend-limit') {
            s.fail = null;
            lockedOut(now + MOCK_POLICY.emailLockMinutes * 60_000);
        }
        // A lock that has passed starts the address over with a full set of codes.
        const fresh = !previous || (lockedUntil !== undefined && now >= lockedUntil);
        if (!fresh) {
            if (now < previous.sentAt + MOCK_POLICY.emailResendSeconds * 1000) {
                fail('conflict', 'too soon to resend', {
                    retryAt: new Date(previous.sentAt + MOCK_POLICY.emailResendSeconds * 1000).toISOString(),
                });
            }
            if (previous.resendsLeft <= 0) lockedOut(now + MOCK_POLICY.emailLockMinutes * 60_000);
        }
        const sent: MockEmailCode = {
            sentAt: now,
            expiresAt: now + MOCK_POLICY.emailCodeMinutes * 60_000,
            attemptsLeft: MOCK_POLICY.emailCodeAttempts,
            resendsLeft: fresh ? MOCK_POLICY.emailResends - 1 : previous.resendsLeft - 1,
        };
        s.emailCodes[emailId] = sent;
        return ticketOf(emailId, sent);
    };

    // Applies what a processing attempt does once it settles. Called before every operation, so a
    // list read after the attempt's time is up already shows its result.
    const settleDue = (s: MockState) => {
        for (const attempt of s.attempts) {
            if (attempt.status !== 'processing' || nowMs() < attempt.settleAt) continue;
            if (attempt.settlesAs === 'failed') {
                attempt.status = 'failed';
                attempt.failure = 'declined';
                if (attempt.purpose === 'retry' && attempt.subscriptionId) {
                    const sub = findSubscription(s, attempt.subscriptionId);
                    s.invoices.unshift({
                        id: nextId(s, 'inv'),
                        issuedAt: s.today,
                        kind: 'retry',
                        planId: sub.planId,
                        amount: planOf(sub.planId).monthly,
                        status: 'failed',
                    });
                }
                continue;
            }
            attempt.status = 'succeeded';
            if (attempt.purpose === 'start' && attempt.planId) settleStart(s, attempt);
            if (attempt.purpose === 'upgrade' && attempt.planId && attempt.subscriptionId) settleUpgrade(s, attempt);
            if (attempt.purpose === 'retry' && attempt.subscriptionId) settleRetry(s, attempt);
        }
    };

    const settleStart = (s: MockState, attempt: MockAttempt) => {
        const plan = planOf(attempt.planId as PlanId);
        const withTrial = !!attempt.withTrial;
        const trialEndsAt = addDays(s.today, MOCK_POLICY.trialDays);
        const lastExpired = s.subscriptions
            .filter(sub => sub.status === 'expired' && sub.expiredAt)
            .sort((a, b) => dayNumber(b.expiredAt as string) - dayNumber(a.expiredAt as string))[0];
        const restored =
            !!lastExpired &&
            dayNumber(s.today) - dayNumber(lastExpired.expiredAt as string) <= MOCK_POLICY.restoreWindowDays;
        const firstCharge = withTrial ? trialEndsAt : s.today;
        const sub: Subscription = {
            id: nextId(s, 'sub'),
            planId: plan.id,
            status: withTrial ? 'trial' : 'active',
            startedAt: s.today,
            billingDay: Number(firstCharge.slice(8, 10)),
            trialEndsAt: withTrial ? trialEndsAt : undefined,
            nextBillingAt: withTrial ? trialEndsAt : addMonths(s.today, 1),
            nextAmount: plan.monthly,
            restored: restored || undefined,
            defaultPaymentMethodId: defaultCard(s)?.id,
        };
        s.subscriptions.unshift(sub);
        if (!withTrial) {
            const id = nextId(s, 'inv');
            s.invoices.unshift({
                id,
                issuedAt: s.today,
                kind: 'first',
                planId: plan.id,
                amount: plan.monthly,
                status: 'paid',
                receiptUrl: mockReceiptUrl(id),
            });
        }
        s.account = { ...s.account, trialUsed: true, billingSource: 'web' };
        attempt.subscriptionId = sub.id;
    };

    const settleUpgrade = (s: MockState, attempt: MockAttempt) => {
        const sub = findSubscription(s, attempt.subscriptionId as string);
        const from = planOf(sub.planId);
        const to = planOf(attempt.planId as PlanId);
        // A trial upgrade changes the plan and charges nothing today, as its preview said.
        const amount =
            sub.status === 'trial'
                ? { amount: 0, currency: to.monthly.currency }
                : prorate(from.monthly, to.monthly, s.today, sub.nextBillingAt);
        sub.planId = to.id;
        sub.nextAmount = to.monthly;
        delete sub.pendingChange;
        if (amount.amount > 0) {
            const id = nextId(s, 'inv');
            s.invoices.unshift({
                id,
                issuedAt: s.today,
                kind: 'upgrade',
                planId: to.id,
                amount,
                status: 'paid',
                receiptUrl: mockReceiptUrl(id),
            });
        }
    };

    const settleRetry = (s: MockState, attempt: MockAttempt) => {
        const sub = findSubscription(s, attempt.subscriptionId as string);
        const failedAt = sub.failedAt ?? s.today;
        sub.status = 'active';
        sub.nextBillingAt = addMonths(failedAt, 1, sub.billingDay);
        sub.nextAmount = planOf(sub.planId).monthly;
        delete sub.failedAt;
        delete sub.restrictAt;
        delete sub.failureReason;
        delete sub.retryAt;
        const id = nextId(s, 'inv');
        s.invoices.unshift({
            id,
            issuedAt: s.today,
            kind: 'retry',
            planId: sub.planId,
            amount: planOf(sub.planId).monthly,
            status: 'paid',
            receiptUrl: mockReceiptUrl(id),
        });
    };

    const startAttempt = (
        s: MockState,
        attempt: Omit<MockAttempt, 'id' | 'status' | 'settleAt' | 'settlesAs'>
    ): PaymentAttempt => {
        const created: MockAttempt = {
            ...attempt,
            id: nextId(s, 'att'),
            status: 'processing',
            settleAt: nowMs() + settleMs,
            settlesAs: s.fail === 'card-declined' ? 'failed' : 'succeeded',
        };
        s.attempts.push(created);
        return publicAttempt(created);
    };

    const previewChangeFor = (s: MockState, planId: PlanId): ChangePreview => {
        const sub = liveSubscription(s) ?? fail('conflict', 'no subscription to change');
        // An ending subscription has no next period to change; it is resumed first.
        if (sub.status === 'cancelScheduled') fail('conflict', 'subscription is ending');
        const from = planOf(sub.planId);
        const to = planOf(planId);
        if (from.id === to.id) fail('conflict', 'already on this plan');
        const kind = to.sort > from.sort ? 'upgrade' : 'downgrade';
        const preview: ChangePreview =
            kind === 'upgrade'
                ? {
                      kind,
                      from,
                      to,
                      amountToday: prorate(from.monthly, to.monthly, s.today, sub.nextBillingAt),
                      effectiveAt: s.today,
                      nextAmount: to.monthly,
                  }
                : { kind, from, to, effectiveAt: sub.nextBillingAt ?? s.today, nextAmount: to.monthly };
        if (sub.status === 'pastDue' || sub.status === 'restricted') preview.blocked = 'pastDue';
        else if (changeKindOf(from, to, s.account) === 'blocked') preview.blocked = 'notAdjacent';
        else if (sub.status === 'trial' && kind === 'upgrade') preview.blocked = 'trialUpgrade';
        else if (sub.pendingChange && sub.pendingChange.effectiveAt === s.today) preview.blocked = 'sameDayAsChange';
        return preview;
    };

    /**
     * Runs one port call: latency, the URL, attempts that came due, the fail flag, the session check,
     * then the operation on a copy of the state — committed only if the operation does not throw.
     */
    const call = async <T>(op: (s: MockState) => T, { auth = true }: { auth?: boolean } = {}): Promise<T> => {
        if (delayMs > 0) await new Promise(resolve => setTimeout(resolve, delayMs));
        syncFromUrl();
        const s = clone(state);
        settleDue(s);
        if (s.fail === 'network') {
            s.fail = null;
            commit(s);
            fail('network', 'mock: injected network failure');
        }
        if (auth && s.fail === 'session-ended') {
            s.fail = null;
            s.signedIn = false;
            commit(s);
            fail('unauthenticated', 'mock: injected session end');
        }
        if (auth && !s.signedIn) fail('unauthenticated');
        const result = op(s);
        commit(s);
        return clone(result);
    };

    const port: SubscriptionPort = {
        // Reading the session is how a page finds out it has none, so it never fails with the flags
        // meant for the calls after it.
        getSession: async () => {
            if (delayMs > 0) await new Promise(resolve => setTimeout(resolve, delayMs));
            syncFromUrl();
            return state.signedIn ? clone(state.account) : null;
        },

        startSignIn: ({ provider, next }) =>
            call(
                s => {
                    const pending = { nonce: nonce(), provider, next, startedAt: nowMs() };
                    s.pendingSignIn = pending;
                    const query = new URLSearchParams({ provider, nonce: pending.nonce });
                    if (next) query.set('next', next);
                    return { redirectUrl: `${ROUTES.subscription.mockProvider}?${query}` };
                },
                { auth: false }
            ),

        completeSignIn: callback =>
            call(
                s => {
                    const pending = s.pendingSignIn;
                    delete s.pendingSignIn;
                    // The record is spent either way, so the outcome is committed even when it fails.
                    commit(clone(s));
                    const tooLate =
                        !!pending && nowMs() - pending.startedAt > MOCK_POLICY.signInAttemptMinutes * 60_000;
                    // A failed round trip still hands back where it was going, so trying again keeps it.
                    const detail = pending?.next ? { next: pending.next } : undefined;
                    if (!pending || callback.get('nonce') !== pending.nonce || tooLate) {
                        fail('signInExpired', undefined, detail);
                    }
                    const provider = (pending as NonNullable<typeof pending>).provider;
                    const result = callback.get('result');
                    if (result === 'canceled') fail('signInCanceled', undefined, detail);
                    if (result !== 'continue' && result !== 'noAccount') fail('signInExpired', undefined, detail);
                    if (result === 'noAccount') {
                        return {
                            noLinkedAccount: true as const,
                            provider,
                            hint: provider === 'google' ? s.signIn.hint : undefined,
                        };
                    }
                    s.signedIn = true;
                    s.account = { ...s.account, provider };
                    return { account: s.account, next: pending?.next };
                },
                { auth: false }
            ),

        signOut: () =>
            call(
                s => {
                    s.signedIn = false;
                },
                { auth: false }
            ),

        listPlans: () => call(() => MOCK_PLANS, { auth: false }),

        listSubscriptions: () => call(s => s.subscriptions),

        getSubscription: id => call(s => findSubscription(s, id)),

        previewCheckout: planId =>
            call(s => {
                const plan = planOf(planId);
                const withTrial = !s.account.trialUsed;
                const trialEndsAt = addDays(s.today, plan.trialDays);
                return {
                    plan,
                    account: s.account,
                    withTrial,
                    amountToday: withTrial ? { amount: 0, currency: plan.monthly.currency } : plan.monthly,
                    trialEndsAt: withTrial ? trialEndsAt : undefined,
                    firstChargeAt: withTrial ? trialEndsAt : s.today,
                };
            }),

        // The provider's window. When a presenter is registered (the stand-in dialog), it asks the
        // reader for the outcome, with the one the fail flag implies preselected; without one (tests)
        // that outcome is taken as is. A declined card fails the window itself only when adding a card
        // is all it is for: ahead of a charge the card registers and the charge that follows is what
        // fails, the way the designs split the two.
        startPaymentMethodRegistration: async ({ purpose, planId, payer }) => {
            const suggested = await call((s): RegistrationOutcome => {
                // The card company refuses a card without its holder, as the real window does.
                if (!isCompletePayer(payer)) fail('conflict', 'mock: payer name, phone and email are required');
                if (s.fail === 'attempt-limit' || s.failedCardAttempts >= MOCK_POLICY.maxCardAttempts) {
                    fail('limit', 'mock: card registration attempts used up');
                }
                if (s.fail === 'closed') return 'closed';
                if (s.fail === 'card-declined' && purpose === 'addCard') return 'failed';
                return 'registered';
            });
            const outcome = paymentWindow ? await paymentWindow({ purpose, planId, suggested }) : suggested;
            return call((s): RegistrationResult => {
                if (outcome === 'failed') s.failedCardAttempts += 1;
                if (outcome !== 'registered') return { outcome };
                const makeDefault = purpose !== 'addCard' || s.paymentMethods.length === 0;
                if (makeDefault) s.paymentMethods.forEach(pm => (pm.isDefault = false));
                const card: PaymentMethod = {
                    id: nextId(s, 'pm'),
                    brand: CARD_BRANDS[s.seq % CARD_BRANDS.length],
                    last4: String(1000 + (s.seq % 9000)).slice(-4),
                    expMonth: 12,
                    expYear: Number(s.today.slice(0, 4)) + 4,
                    isDefault: makeDefault,
                    expiringSoon: false,
                };
                s.paymentMethods.push(card);
                if (makeDefault) {
                    s.subscriptions.filter(isLive).forEach(sub => (sub.defaultPaymentMethodId = card.id));
                }
                return { outcome, card: card.id as CardToken };
            });
        },

        startCheckout: ({ planId, country, emailId, payer }) =>
            call(s => {
                // A second submit while the first is still processing gets the same attempt back,
                // as a server would, rather than a second subscription when both settle.
                const pending = s.attempts.find(a => a.purpose === 'start' && a.status === 'processing');
                if (pending) return publicAttempt(pending);
                if (!isCompletePayer(payer)) fail('conflict', 'payer name, phone and email are required');
                if (liveSubscription(s)) fail('conflict', 'already subscribed');
                if (changeKindOf(undefined, planOf(planId), s.account) !== 'new') fail('conflict', 'plan not sellable');
                if (country !== 'KR') fail('conflict', 'billing country not supported yet');
                if (!defaultCard(s)) fail('conflict', 'no payment method');
                const email = s.billing.emails.find(e => e.id === emailId);
                if (!email || email.status !== 'verified') fail('conflict', 'billing email not verified');
                return startAttempt(s, { purpose: 'start', planId, withTrial: !s.account.trialUsed });
            }),

        getPaymentAttempt: id =>
            call(s => {
                const attempt = s.attempts.find(a => a.id === id) ?? fail('notFound', `no attempt ${id}`);
                return publicAttempt(attempt);
            }),

        previewChange: planId => call(s => previewChangeFor(s, planId)),

        changePlan: planId =>
            call(s => {
                const preview = previewChangeFor(s, planId);
                if (preview.blocked) fail('conflict', `change blocked: ${preview.blocked}`);
                const sub = liveSubscription(s) as Subscription;
                if (preview.kind === 'upgrade') {
                    return startAttempt(s, { purpose: 'upgrade', planId, subscriptionId: sub.id });
                }
                sub.pendingChange = { planId, effectiveAt: preview.effectiveAt };
                sub.nextAmount = preview.nextAmount;
                return { scheduled: true as const, effectiveAt: preview.effectiveAt };
            }),

        cancelScheduledChange: subscriptionId =>
            call(s => {
                const sub = findSubscription(s, subscriptionId);
                if (!sub.pendingChange) fail('conflict', 'no scheduled change');
                // On the day it applies the charge may already be under way.
                if (sub.pendingChange?.effectiveAt === s.today) fail('conflict', 'change applies today');
                delete sub.pendingChange;
                sub.nextAmount = planOf(sub.planId).monthly;
                return sub;
            }),

        cancelSubscription: subscriptionId =>
            call(s => {
                const sub = findSubscription(s, subscriptionId);
                if (sub.status !== 'trial' && sub.status !== 'active') fail('conflict', `cannot cancel ${sub.status}`);
                sub.endsAt = sub.status === 'trial' ? sub.trialEndsAt : sub.nextBillingAt;
                sub.status = 'cancelScheduled';
                delete sub.pendingChange;
                delete sub.nextBillingAt;
                delete sub.nextAmount;
                return sub;
            }),

        resumeSubscription: subscriptionId =>
            call(s => {
                const sub = findSubscription(s, subscriptionId);
                if (sub.status !== 'cancelScheduled') fail('conflict', 'not scheduled to end');
                if (!defaultCard(s)) fail('conflict', 'no payment method to renew with');
                const stillTrial = !!sub.trialEndsAt && dayNumber(sub.trialEndsAt) > dayNumber(s.today);
                sub.status = stillTrial ? 'trial' : 'active';
                sub.nextBillingAt = sub.endsAt;
                sub.nextAmount = planOf(sub.planId).monthly;
                delete sub.endsAt;
                return sub;
            }),

        listPaymentMethods: () => call(s => s.paymentMethods),

        setDefaultPaymentMethod: id =>
            call(s => {
                if (!s.paymentMethods.some(pm => pm.id === id)) fail('notFound', `no card ${id}`);
                s.paymentMethods.forEach(pm => (pm.isDefault = pm.id === id));
                s.subscriptions.filter(isLive).forEach(sub => (sub.defaultPaymentMethodId = id));
                return s.paymentMethods;
            }),

        removePaymentMethod: id =>
            call(s => {
                const pm = s.paymentMethods.find(m => m.id === id) ?? fail('notFound', `no card ${id}`);
                const check = canRemovePaymentMethod(pm, s.paymentMethods, liveSubscription(s));
                if (check !== 'ok') fail('conflict', `cannot remove: ${check}`);
                s.paymentMethods = s.paymentMethods.filter(m => m.id !== id);
                return s.paymentMethods;
            }),

        retryPayment: subscriptionId =>
            call(s => {
                const sub = findSubscription(s, subscriptionId);
                const pending = s.attempts.find(
                    a => a.purpose === 'retry' && a.subscriptionId === subscriptionId && a.status === 'processing'
                );
                if (pending) return publicAttempt(pending);
                if (sub.status !== 'pastDue' && sub.status !== 'restricted') fail('conflict', 'nothing to retry');
                if (!defaultCard(s)) fail('conflict', 'no payment method');
                return startAttempt(s, { purpose: 'retry', subscriptionId });
            }),

        listInvoices: () => call(s => [...s.invoices].sort((a, b) => dayNumber(b.issuedAt) - dayNumber(a.issuedAt))),

        getBillingInfo: () => call(s => s.billing),

        requestEmailCode: address =>
            call(s => {
                const domain = address.split('@')[1]?.toLowerCase() ?? '';
                if ((MOCK_POLICY.disposableEmailDomains as readonly string[]).includes(domain)) {
                    fail('disposableEmail');
                }
                const existing = s.billing.emails.find(e => e.address.toLowerCase() === address.toLowerCase());
                if (existing?.status === 'verified') fail('conflict', 'already verified');
                // An address still waiting keeps its live code — asking again within its lifetime hands back
                // the same ticket rather than a "too soon"; once the code is dead it gets a fresh one.
                if (existing) {
                    const live = s.emailCodes[existing.id];
                    // Only a code that can still be used: one spent on wrong entries is not handed back.
                    if (live && nowMs() < live.expiresAt && !live.lockedUntil && live.attemptsLeft > 0) {
                        return ticketOf(existing.id, live);
                    }
                    return sendCode(s, existing.id);
                }
                if (s.billing.emails.length >= MOCK_POLICY.maxBillingEmails) fail('limit', 'billing email limit');
                const id = nextId(s, 'em');
                s.billing.emails.push({
                    id,
                    address,
                    primary: false,
                    status: 'pending',
                    receives: ['receipt', 'notice'],
                });
                return sendCode(s, id);
            }),

        resendEmailCode: emailId =>
            call(s => {
                const email = s.billing.emails.find(e => e.id === emailId) ?? fail('notFound', `no email ${emailId}`);
                if (email.status === 'verified') fail('conflict', 'already verified');
                return sendCode(s, emailId);
            }),

        verifyEmailCode: (emailId, code) =>
            call(s => {
                const email = s.billing.emails.find(e => e.id === emailId) ?? fail('notFound', `no email ${emailId}`);
                // A second check of an address already verified (a retry, another tab) is not an error.
                if (email.status === 'verified') return email;
                // An address a scenario seeds as waiting has no send on record: count it as sent just now.
                if (!s.emailCodes[emailId] && email.status === 'pending') sendCode(s, emailId);
                const sent = s.emailCodes[emailId] ?? fail('codeExpired', 'no code sent');
                if (s.fail === 'code-expired') {
                    s.fail = null;
                    commit(clone(s));
                    fail('codeExpired');
                }
                if (nowMs() > sent.expiresAt) fail('codeExpired');
                if (sent.attemptsLeft <= 0) fail('tooManyAttempts');
                if (code !== MOCK_POLICY.emailCode) {
                    // The wrong entry counts even though the call fails.
                    sent.attemptsLeft -= 1;
                    commit(clone(s));
                    if (sent.attemptsLeft <= 0) fail('tooManyAttempts');
                    fail('invalidCode', undefined, { attemptsLeft: sent.attemptsLeft });
                }
                delete s.emailCodes[emailId];
                email.status = 'verified';
                if (!s.billing.emails.some(e => e.primary)) email.primary = true;
                return email;
            }),

        adoptSignInEmail: () =>
            call(s => {
                const address = s.account.email;
                if (s.account.provider !== 'google' || !address) fail('conflict', 'no Google sign-in address');
                const known = s.billing.emails.find(e => e.address.toLowerCase() === (address as string).toLowerCase());
                if (known?.status === 'verified') return known;
                if (known) {
                    known.status = 'verified';
                    delete s.emailCodes[known.id];
                    if (!s.billing.emails.some(e => e.primary)) known.primary = true;
                    return known;
                }
                if (s.billing.emails.length >= MOCK_POLICY.maxBillingEmails) fail('limit', 'billing email limit');
                const email: BillingEmail = {
                    id: nextId(s, 'em'),
                    address: address as string,
                    primary: !s.billing.emails.some(e => e.primary),
                    status: 'verified',
                    receives: ['receipt', 'notice'],
                };
                s.billing.emails.push(email);
                return email;
            }),

        replaceEmail: (emailId, newEmailId) =>
            call(s => {
                const old = s.billing.emails.find(e => e.id === emailId) ?? fail('notFound', `no email ${emailId}`);
                const next =
                    s.billing.emails.find(e => e.id === newEmailId) ?? fail('notFound', `no email ${newEmailId}`);
                if (old.id === next.id) fail('conflict', 'the same address');
                if (next.status !== 'verified') fail('conflict', 'only a verified address can take over');
                // The primary mark moves with the old address; a new address that already was primary keeps it.
                next.primary = next.primary || old.primary;
                next.receives = [...old.receives];
                s.billing.emails = s.billing.emails.filter(e => e.id !== old.id);
                return s.billing;
            }),

        setPrimaryEmail: emailId =>
            call(s => {
                const email = s.billing.emails.find(e => e.id === emailId) ?? fail('notFound', `no email ${emailId}`);
                if (email.status !== 'verified') fail('conflict', 'only a verified email can be primary');
                s.billing.emails.forEach(e => (e.primary = e.id === emailId));
                return s.billing;
            }),

        setEmailReceives: (emailId, receives) =>
            call(s => {
                const email = s.billing.emails.find(e => e.id === emailId) ?? fail('notFound', `no email ${emailId}`);
                email.receives = [...receives];
                return s.billing;
            }),

        removeEmail: emailId =>
            call(s => {
                const email = s.billing.emails.find(e => e.id === emailId) ?? fail('notFound', `no email ${emailId}`);
                if (email.primary) fail('conflict', 'the primary email cannot be removed');
                s.billing.emails = s.billing.emails.filter(e => e.id !== emailId);
                return s.billing;
            }),
    };

    const controller: MockController = {
        getState: () => {
            syncFromUrl();
            return state;
        },
        peek: () => state,
        subscribe: listener => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        reset: () =>
            commit({
                ...buildScenario(state.scenario, { noCards: state.noCards, panelHidden: state.panelHidden }),
                appliedSearches: state.appliedSearches,
            }),
        setScenario: scenario =>
            commit({
                ...buildScenario(scenario, { panelHidden: state.panelHidden }),
                appliedSearches: state.appliedSearches,
            }),
        setFail: flag => commit({ ...state, fail: flag }),
        setToday: today => commit({ ...state, today: today ?? buildScenario(state.scenario).today }),
        setPanelHidden: hidden => commit({ ...state, panelHidden: hidden }),
        setPaymentWindow: presenter => {
            paymentWindow = presenter;
        },
    };

    // Local noon of the mock's today: the same calendar day in every time zone a reader is in. Read
    // during render, so it peeks; the URL was applied when the mock was created.
    const clock: Clock = { now: () => new Date(`${state.today}T12:00:00`) };

    // The page's first URL is applied now, before anything renders, so the first screen already reads
    // the scenario's today and the panel's visibility.
    syncFromUrl();
    // `panel=` is honoured on every page load, even for a query already applied: it is the only way
    // back after the panel's Hide button.
    const panel = new URLSearchParams(readSearch()).get('panel');
    if (panel === '0' || panel === '1') {
        const hidden = panel === '0';
        if (state.panelHidden !== hidden) commit({ ...state, panelHidden: hidden });
    }

    return { port, controller, clock };
};

/**
 * What the stand-in consent page selects first: the scenario's own answer, unless a sign-in fail flag
 * asks for the canceled or timed-out round trip instead.
 */
export const consentDefaultOf = (state: MockState): ConsentChoice => {
    if (state.fail === 'signin-canceled') return 'canceled';
    if (state.fail === 'signin-expired') return 'expired';
    return state.signIn.defaultChoice;
};
