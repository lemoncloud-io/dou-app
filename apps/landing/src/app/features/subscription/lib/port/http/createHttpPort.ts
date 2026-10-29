import { ROUTES } from '../../../../../routes/paths';
import { addDays, toIsoDate } from '../../calendar';
import { PLAN_CATALOG } from '../../catalog';
import { changeKindOf } from '../../changeKindOf';
import { SubscriptionPortError } from '../errors';
import { failureOf, isDeclinedPayment, portErrorOf } from './errors';
import {
    type CatalogPlan,
    type IssueParams,
    type MembershipWire,
    type ProductWire,
    type SubscriptionWire,
    attemptFromSubscription,
    attemptId,
    planOfProduct,
    dayOf,
    parseAttemptId,
    prorate,
    toAccount,
    toCatalog,
    toPaymentMethod,
    toPlan,
    toSubscription,
    type CardWire,
} from './wire';

import { windowResultOfQuery } from './windowReturn';

import type { HttpPort } from './methods';
import type {
    Account,
    AttemptPurpose,
    CardToken,
    ChangePreview,
    Payer,
    PaymentAttempt,
    PlanId,
    RegistrationResult,
    SignInProvider,
    Subscription,
} from '../../../types';

export type HttpRequest = (
    method: 'GET' | 'POST',
    url: string,
    options?: { params?: Record<string, string>; body?: unknown }
) => Promise<unknown>;

/** The relay session the reader signs in to, as this port needs it. */
export interface SessionAccess {
    /** The signed-in account's user fields, or `null` with no session. */
    user(): Record<string, unknown> | null;
    /** Turns the code the OAuth relay returned into a session. */
    exchange(provider: SignInProvider, code: string): Promise<void>;
    /** Ends the session here. Leaves the page. */
    signOut(): Promise<void>;
}

export type PaymentWindowResult = { outcome: 'registered'; billingKey: string } | { outcome: 'failed' | 'closed' };

/** Where a card is entered: the payment provider's window, or the stand-in while payments are samples. */
export type PaymentWindow = (request: {
    issue: IssueParams;
    payer: Payer;
    purpose: AttemptPurpose;
    planId?: PlanId;
    /** Where a window that leaves the page (a phone's) comes back to, with its result in the query. */
    redirectUrl: string;
}) => Promise<PaymentWindowResult>;

export interface KeyValueStore {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}

export interface HttpPortOptions {
    /** The subscription API's base address. */
    backend: string;
    /** Ask the server for sample payments (its `?mock`) on every subscription call. */
    paymentsMock: boolean;
    /** The OAuth relay the browser leaves for to sign in. */
    socialOauth: string;
    /** This site's origin, which the OAuth relay sends the reader back to. */
    origin: string;
    request: HttpRequest;
    session: SessionAccess;
    paymentWindow: PaymentWindow;
    /** Holds the sign-in in flight across the trip to the provider. Session storage in the browser. */
    storage: KeyValueStore;
    now?: () => number;
    nonce?: () => string;
}

const SIGN_IN_KEY = 'subscription.signIn';
const PROVIDER_KEY = 'subscription.signInProvider';
/** How long a sign-in may take at the provider before its return is refused. */
const SIGN_IN_MINUTES = 10;

interface PendingSignIn {
    nonce: string;
    provider: SignInProvider;
    next?: string;
    startedAt: number;
}

/** Codes shorter than this are the OAuth relay reporting a failure in the code's place. */
const MIN_CODE_LENGTH = 6;

/**
 * The page a window that left comes back to: the checkout's card step, or the subscription a card was
 * added to (the card list is not always open).
 */
const returnPathOf = (purpose: AttemptPurpose, planId: PlanId | undefined, subscriptionId?: string): string =>
    purpose === 'start' && planId
        ? `${ROUTES.subscription.checkoutPayment}?plan=${planId}`
        : subscriptionId
          ? ROUTES.subscription.detail(subscriptionId)
          : ROUTES.subscription.paymentMethods;

const fail = (code: SubscriptionPortError['code'], message?: string, detail?: SubscriptionPortError['detail']) => {
    throw new SubscriptionPortError(code, message, detail);
};

/**
 * The port over the subscription server (chatic-backend-api), for the methods it answers
 * (`HTTP_METHODS`).
 *
 * Signing in is the admin console's route: the browser leaves for the OAuth relay, comes back to
 * W-02's callback with a code, and the code becomes the same relay session the web app uses. Every
 * call after that is signed with it. The server keeps one subscription per account, so the list the
 * screens draw has one entry at most, and it answers a checkout with the subscription rather than an
 * attempt — the attempt the screens follow is made up here from it (`wire.ts`).
 *
 * The network, the session and the payment window are passed in, so this file is the whole
 * translation and can be tested against the server's response shapes alone.
 */
export const createHttpPort = (options: HttpPortOptions): HttpPort => {
    const { backend, paymentsMock, request, session, paymentWindow, storage } = options;
    const now = options.now ?? (() => Date.now());
    const nonce = options.nonce ?? (() => Math.random().toString(36).slice(2, 12));

    // A session the server refused stays refused for this page: the stored credentials are still
    // there, so without this the sign-in page would see a session and send the reader straight back.
    let lost = false;
    let catalog: Promise<CatalogPlan[]> | undefined;

    /** Sends a signed request as it is, rejecting with whatever the transport rejects with. */
    const send = <T>(
        method: 'GET' | 'POST',
        path: string,
        body?: unknown,
        query?: Record<string, string>
    ): Promise<T> => {
        if (lost || !session.user()) return Promise.reject(new SubscriptionPortError('unauthenticated', 'no session'));
        // The sample payments are the subscription server's; the plans take no such flag.
        const params = query ?? (paymentsMock ? { mock: '1' } : undefined);
        return request(method, `${backend}${path}`, { params, body }) as Promise<T>;
    };

    /** `send`, with the failure turned into the port's error. */
    const call = async <T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> => {
        try {
            return await send<T>(method, path, body);
        } catch (error) {
            throw lostIf(portErrorOf(error));
        }
    };

    const lostIf = (error: SubscriptionPortError): SubscriptionPortError => {
        if (error.code === 'unauthenticated') lost = true;
        return error;
    };

    // The server lists its plans to a signed request only, so the catalog is read once there is a
    // session; a visitor is shown the published catalog instead (`listPlans`).
    const loadCatalog = (): Promise<CatalogPlan[]> => {
        catalog ??= send<{ list?: ProductWire[] }>('GET', '/products/0/plans', undefined, {
            platform: 'portone',
        }).then(
            result => toCatalog(result?.list ?? []),
            error => {
                catalog = undefined;
                throw lostIf(portErrorOf(error));
            }
        );
        return catalog;
    };

    const catalogPlan = async (planId: PlanId): Promise<CatalogPlan> =>
        (await loadCatalog()).find(plan => plan.id === planId) ?? fail('notFound', `no plan ${planId}`);

    /**
     * The subscription with the card it is charged to. The server keeps one card per subscription and
     * names it the default, so that is the card the screens show beside it.
     */
    const readMineWithCard = async (): Promise<Subscription | undefined> => {
        const { sub } = await readMine();
        if (!sub || sub.status === 'expired') return sub;
        const cards = await call<CardWire[]>('GET', '/subscriptions/0/cards');
        const card = (cards ?? []).find(each => each.isDefault && each.id);
        return card ? { ...sub, defaultPaymentMethodId: card.id } : sub;
    };

    const readMine = async (): Promise<{ wire?: SubscriptionWire; sub?: Subscription }> => {
        const [mine, plans] = await Promise.all([
            call<{ subscription?: SubscriptionWire }>('GET', '/subscriptions/0/mine'),
            loadCatalog(),
        ]);
        const wire = mine?.subscription;
        return { wire, sub: wire ? toSubscription(wire, plans) : undefined };
    };

    const getSession = async (): Promise<Account | null> => {
        const user = lost ? null : session.user();
        if (!user) return null;
        let membership: MembershipWire | undefined;
        try {
            membership = await call<MembershipWire>('GET', '/memberships/0/mine');
        } catch (error) {
            if ((error as SubscriptionPortError).code === 'unauthenticated') return null;
            // An account that never bought anything may have no membership to read.
            if ((error as SubscriptionPortError).code !== 'notFound') throw error;
        }
        const provider = storage.getItem(PROVIDER_KEY) === 'apple' ? 'apple' : 'google';
        return toAccount({ user, provider, membership });
    };

    const requireSession = async (): Promise<Account> => (await getSession()) ?? fail('unauthenticated');

    const previewChange = async (planId: PlanId): Promise<ChangePreview> => {
        const [{ wire, sub }, plans, account] = await Promise.all([readMine(), loadCatalog(), requireSession()]);
        if (!wire || !sub || (sub.status !== 'trial' && sub.status !== 'active')) {
            return fail('conflict', 'no subscription that can change plan');
        }
        const from = plans.find(plan => plan.id === sub.planId) as CatalogPlan;
        const to = await catalogPlan(planId);
        const kind = changeKindOf(toPlan(from), toPlan(to), account);
        if (kind === 'new' || kind === 'current') return fail('conflict', `cannot change to ${planId}`);
        const direction = to.sort > from.sort ? 'upgrade' : 'downgrade';
        const today = toIsoDate(new Date(now()));
        const preview: ChangePreview = {
            kind: direction,
            from: toPlan(from),
            to: toPlan(to),
            effectiveAt: direction === 'upgrade' ? today : (sub.nextBillingAt ?? today),
            nextAmount: to.monthly,
        };
        if (direction === 'upgrade') {
            preview.amountToday = prorate(from.monthly, to.monthly, wire.validFrom ?? 0, wire.validUntil ?? 0, now());
        }
        if (kind === 'blocked') preview.blocked = 'notAdjacent';
        // The server upgrades a paid period only (409 during a trial); a trial can move down.
        else if (direction === 'upgrade' && sub.status === 'trial') preview.blocked = 'trialUpgrade';
        return preview;
    };

    /**
     * What a window's result means: a checkout's card goes with the start that follows, any other card
     * replaces the one the subscription holds right away.
     */
    const registered = async (
        result: PaymentWindowResult,
        purpose: AttemptPurpose,
        payer: Payer
    ): Promise<RegistrationResult> => {
        if (result.outcome !== 'registered') return { outcome: result.outcome };
        if (purpose !== 'start') {
            await call<CardWire>('POST', '/subscriptions/0/card', { billingKey: result.billingKey, ...payer });
        }
        return { outcome: 'registered', card: result.billingKey as CardToken };
    };

    const failedAttempt = (purpose: AttemptPurpose, withTrial: boolean): PaymentAttempt => {
        const attempt: PaymentAttempt = { id: '', purpose, status: 'failed', failure: 'declined', withTrial };
        return { ...attempt, id: attemptId(attempt) };
    };

    return {
        getSession,

        startSignIn: async ({ provider, next }) => {
            const pending: PendingSignIn = { nonce: nonce(), provider, next, startedAt: now() };
            storage.setItem(SIGN_IN_KEY, JSON.stringify(pending));
            // The relay appends its code to this address as it is given, so it is not encoded — the
            // nonce is plain letters and digits.
            const back = `${options.origin}${ROUTES.subscription.loginCallback}?state=${pending.nonce}`;
            return { redirectUrl: `${options.socialOauth}/oauth/${provider}/authorize?redirect=${back}` };
        },

        completeSignIn: async callback => {
            const raw = storage.getItem(SIGN_IN_KEY);
            // The record is spent either way: a second exchange of the same return would be refused.
            storage.removeItem(SIGN_IN_KEY);
            let pending: PendingSignIn | undefined;
            try {
                pending = raw ? (JSON.parse(raw) as PendingSignIn) : undefined;
            } catch {
                pending = undefined;
            }
            const detail = pending?.next ? { next: pending.next } : undefined;
            const tooLate = !!pending && now() - pending.startedAt > SIGN_IN_MINUTES * 60_000;
            if (!pending || callback.get('state') !== pending.nonce || tooLate) {
                return fail('signInExpired', 'sign-in record missing, mismatched or too old', detail);
            }
            const code = callback.get('code') ?? '';
            if (code.length < MIN_CODE_LENGTH) return fail('signInCanceled', 'no code came back', detail);
            const provider = callback.get('provider') === 'apple' ? 'apple' : pending.provider;
            try {
                await session.exchange(provider, code);
            } catch (error) {
                const { status } = failureOf(error);
                return fail(status ? 'signInExpired' : 'network', 'code exchange failed', detail);
            }
            lost = false;
            storage.setItem(PROVIDER_KEY, provider);
            // The server makes an account for a sign-in it does not know, so there is no
            // "no linked account" answer to give here.
            return { account: await requireSession(), next: pending.next };
        },

        signOut: async () => {
            lost = true;
            storage.removeItem(PROVIDER_KEY);
            await session.signOut();
        },

        listPlans: async () => (lost || !session.user() ? PLAN_CATALOG : (await loadCatalog()).map(toPlan)),

        listSubscriptions: async () => {
            const sub = await readMineWithCard();
            return sub ? [sub] : [];
        },

        getSubscription: async id => {
            const sub = await readMineWithCard();
            return sub && sub.id === id ? sub : fail('notFound', `no subscription ${id}`);
        },

        previewCheckout: async planId => {
            const [plan, account, { wire }] = await Promise.all([catalogPlan(planId), requireSession(), readMine()]);
            const withTrial = plan.trialDays > 0 && !account.trialUsed && !wire?.trialUsed;
            const today = toIsoDate(new Date(now()));
            const trialEndsAt = addDays(today, plan.trialDays);
            return {
                plan: toPlan(plan),
                account,
                withTrial,
                amountToday: withTrial ? { amount: 0, currency: plan.monthly.currency } : plan.monthly,
                trialEndsAt: withTrial ? trialEndsAt : undefined,
                firstChargeAt: withTrial ? trialEndsAt : today,
            };
        },

        startPaymentMethodRegistration: async ({ purpose, planId, payer }) => {
            // The window is opened for a product, whose platform picks the payment provider. A card
            // added on its own goes with the plan already held, or the first plan if none is.
            const held = planId ? undefined : (await readMine()).wire;
            const productId = planId
                ? (await catalogPlan(planId)).productId
                : (planOfProduct(await loadCatalog(), held?.productId)?.productId ??
                  (await loadCatalog())[0]?.productId);
            if (!productId) return fail('notFound', 'no product to register a card for');
            const issue = await call<IssueParams>('POST', '/subscriptions/0/issue', { productId });
            const redirectUrl = `${options.origin}${returnPathOf(purpose, planId, held?.id)}`;
            let outcome: PaymentWindowResult;
            try {
                outcome = await paymentWindow({ issue, payer, purpose, planId, redirectUrl });
            } catch (error) {
                // The provider's script refusing to open — not a closed window, which answers `closed`. Its
                // own words go to the console, where a phone's remote inspector can read them.
                console.warn('payment window failed to open', error);
                throw error;
            }
            return registered(outcome, purpose, payer);
        },

        // A window that left the page answers in the query of the address it came back to.
        completePaymentMethodRegistration: async ({ callback, purpose, payer }) => {
            const result = windowResultOfQuery(callback);
            if (!result) return fail('conflict', 'the return carries no result from the payment window');
            return registered(result, purpose, payer);
        },

        startCheckout: async ({ planId, payer, card }) => {
            const plan = await catalogPlan(planId);
            const body = card
                ? { productId: plan.productId, billingKey: card, ...payer }
                : { productId: plan.productId };
            try {
                const view = await send<SubscriptionWire>('POST', '/subscriptions/0/start', body);
                const sub = toSubscription(view, await loadCatalog());
                return attemptFromSubscription({ purpose: 'start', withTrial: view.status === 'trial' }, sub, {
                    unread: true,
                });
            } catch (error) {
                // The server refuses a charge the card company declined with 403, having saved nothing.
                if (isDeclinedPayment(error)) return failedAttempt('start', false);
                throw lostIf(portErrorOf(error));
            }
        },

        getPaymentAttempt: async id => {
            const attempt = parseAttemptId(id) ?? fail('notFound', `no attempt ${id}`);
            if (attempt.status !== 'processing') return attempt;
            return attemptFromSubscription(attempt, (await readMine()).sub);
        },

        previewChange,

        changePlan: async planId => {
            const preview = await previewChange(planId);
            if (preview.blocked) return fail('conflict', `change blocked: ${preview.blocked}`);
            const plan = await catalogPlan(planId);
            try {
                const view = await send<SubscriptionWire>('POST', '/subscriptions/0/change', {
                    productId: plan.productId,
                });
                if (preview.kind === 'downgrade') {
                    return { scheduled: true as const, effectiveAt: dayOf(view.validUntil) ?? preview.effectiveAt };
                }
                return attemptFromSubscription(
                    { purpose: 'upgrade', withTrial: false },
                    toSubscription(view, await loadCatalog()),
                    { unread: true }
                );
            } catch (error) {
                if (preview.kind === 'upgrade' && isDeclinedPayment(error)) {
                    return failedAttempt('upgrade', false);
                }
                // A 409 here is also the server unsure whether the difference was paid; the plan is
                // unchanged then, and the screen says the change cannot be made now.
                throw lostIf(portErrorOf(error));
            }
        },

        cancelSubscription: async id => {
            const view = await call<SubscriptionWire>('POST', '/subscriptions/0/cancel');
            return toSubscription(view, await loadCatalog()) ?? fail('notFound', `no subscription ${id}`);
        },

        listPaymentMethods: async () => {
            const cards = await call<CardWire[]>('GET', '/subscriptions/0/cards');
            return (cards ?? []).map(toPaymentMethod).filter((card): card is NonNullable<typeof card> => !!card);
        },

        // The server holds one card per subscription and removes that one; it takes no id.
        removePaymentMethod: async () => {
            await call<SubscriptionWire>('POST', '/subscriptions/0/card-delete');
            const cards = await call<CardWire[]>('GET', '/subscriptions/0/cards');
            return (cards ?? []).map(toPaymentMethod).filter((card): card is NonNullable<typeof card> => !!card);
        },
    };
};
