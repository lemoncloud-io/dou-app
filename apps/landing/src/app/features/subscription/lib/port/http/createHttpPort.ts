import { ROUTES } from '../../../../../routes/paths';
import { addDays, toIsoDate } from '../../calendar';
import { KOREA, payerRequiredFor, providerOfCountry, providerOfCurrency } from '../../billingCountry';
import { planCatalogIn } from '../../catalog';
import { changeKindOf } from '../../changeKindOf';
import { SubscriptionPortError } from '../errors';
import { failureOf, isDeclinedPayment, portErrorOf } from './errors';
import {
    type CatalogPlan,
    type Issue,
    type IssueWire,
    type MembershipWire,
    type ProductWire,
    type SubscriptionWire,
    attemptFromSubscription,
    attemptId,
    missingPayerFields,
    planOfProduct,
    dayOf,
    parseAttemptId,
    providerOfPlatform,
    prorate,
    toAccount,
    toCatalog,
    toIssue,
    toPaymentMethod,
    toPlan,
    toSubscription,
    type CardWire,
} from './wire';

import { windowResultOfQuery } from './windowReturn';

import type { HttpPort } from './methods';
import type { CardEntryTerms } from '../cardEntry';
import type {
    Account,
    AttemptPurpose,
    CardToken,
    ChangePreview,
    CheckoutPreview,
    Payer,
    PaymentAttempt,
    PaymentMethod,
    PaymentProvider,
    PlanId,
    RegistrationResult,
    SignInProvider,
    Subscription,
} from '../../../types';

/**
 * The subscription server's calls, named as the runtime's subscription repository names them — in the
 * app that repository is passed as it is (`runtime.ts`). A call rejects with whatever the transport
 * rejected with; `errors.ts` reads it.
 */
export interface SubscriptionApi {
    fetchPlans(params?: Record<string, unknown>): Promise<{ list?: ProductWire[] }>;
    fetchMembershipInfo(): Promise<MembershipWire>;
    fetchMySubscription(): Promise<{ subscription?: SubscriptionWire }>;
    fetchSubscriptionCards(): Promise<CardWire[]>;
    issueBillingKey(productId: string): Promise<IssueWire>;
    startSubscription(body: { productId: string; billingKey?: string } & Partial<Payer>): Promise<SubscriptionWire>;
    changeSubscription(productId: string): Promise<SubscriptionWire>;
    cancelSubscription(): Promise<SubscriptionWire>;
    /** The payer goes with the card only where its provider requires one. */
    addCard(body: { billingKey: string } & Partial<Payer>): Promise<CardWire>;
    setDefaultCard(billkeyId: string): Promise<CardWire>;
    removeCard(billkeyId: string): Promise<CardWire>;
}

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

/**
 * Where a card is entered: the won provider's own window, or the dollar provider's card field in our
 * dialog — `issue.provider` says which. A card the dollar provider registers answers with its payment
 * method id in `billingKey`, which the server takes in the same place.
 */
export type PaymentWindow = (request: {
    issue: Issue;
    /** Present where the provider requires one (`issue.required`). */
    payer?: Payer;
    purpose: AttemptPurpose;
    planId?: PlanId;
    /** The billing country the reader chose, which the card field starts from. */
    country?: string;
    /** What the consent under a card field of ours states. */
    terms: CardEntryTerms;
    /** Where a window that leaves the page (a phone's) comes back to, with its result in the query. */
    redirectUrl: string;
}) => Promise<PaymentWindowResult>;

export interface KeyValueStore {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}

export interface HttpPortOptions {
    /** The OAuth relay the browser leaves for to sign in. */
    socialOauth: string;
    /** This site's origin, which the OAuth relay sends the reader back to. */
    origin: string;
    api: SubscriptionApi;
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

/** The page a window that left comes back to: the checkout's card step, or the card list (W-12). */
const returnPathOf = (purpose: AttemptPurpose, planId: PlanId | undefined): string =>
    purpose === 'start' && planId
        ? `${ROUTES.subscription.checkoutPayment}?plan=${planId}`
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
 * The server's calls, the session and the payment window are passed in, so this file is the whole
 * translation and can be tested against the server's response shapes alone.
 */
export const createHttpPort = (options: HttpPortOptions): HttpPort => {
    const { api, session, paymentWindow, storage } = options;
    const now = options.now ?? (() => Date.now());
    const nonce = options.nonce ?? (() => Math.random().toString(36).slice(2, 12));

    // A session the server refused stays refused for this page: the stored credentials are still
    // there, so without this the sign-in page would see a session and send the reader straight back.
    let lost = false;
    const catalogs = new Map<PaymentProvider, Promise<CatalogPlan[]>>();

    /** Makes a call with the session, rejecting with whatever the transport rejects with. */
    const send = <T>(work: (server: SubscriptionApi) => Promise<T>): Promise<T> => {
        if (lost || !session.user()) return Promise.reject(new SubscriptionPortError('unauthenticated', 'no session'));
        return work(api);
    };

    /** `send`, with the failure turned into the port's error. */
    const call = async <T>(work: (server: SubscriptionApi) => Promise<T>): Promise<T> => {
        try {
            return await send(work);
        } catch (error) {
            throw lostIf(portErrorOf(error));
        }
    };

    const lostIf = (error: SubscriptionPortError): SubscriptionPortError => {
        if (error.code === 'unauthenticated') lost = true;
        return error;
    };

    // The server lists its plans to a signed request only, so a catalog is read once there is a
    // session; a visitor is shown the published catalog instead (`listPlans`). Each provider sells the
    // same tiers in its own currency, as products of its own, so each has a catalog of its own and the
    // tier pairs them (`toCatalogPlan`).
    const loadCatalog = (provider: PaymentProvider): Promise<CatalogPlan[]> => {
        let catalog = catalogs.get(provider);
        if (!catalog) {
            catalog = send(server => server.fetchPlans({ platform: provider })).then(
                result => toCatalog(result?.list ?? [], provider),
                error => {
                    catalogs.delete(provider);
                    throw lostIf(portErrorOf(error));
                }
            );
            catalogs.set(provider, catalog);
        }
        return catalog;
    };

    const catalogPlan = async (planId: PlanId, provider: PaymentProvider): Promise<CatalogPlan> =>
        (await loadCatalog(provider)).find(plan => plan.id === planId) ?? fail('notFound', `no plan ${planId}`);

    /**
     * The subscription with the card it is charged to. The card list holds every provider's cards with a
     * default for each, so the card beside a subscription is the default of its own provider.
     */
    const readMineWithCard = async (): Promise<Subscription | undefined> => {
        const { sub } = await readMine();
        if (!sub || sub.status === 'expired') return sub;
        const cards = await call(server => server.fetchSubscriptionCards());
        const card = (cards ?? [])
            .map(each => toPaymentMethod(each, new Date(now())))
            .find(each => each?.isDefault && each.provider === sub.provider);
        return card ? { ...sub, defaultPaymentMethodId: card.id } : sub;
    };

    /** The account's subscription, read against the catalog of the provider that charges it. */
    const readMine = async (): Promise<{ wire?: SubscriptionWire; sub?: Subscription }> => {
        const mine = await call(server => server.fetchMySubscription());
        const wire = mine?.subscription;
        const provider = providerOfPlatform(wire?.platform);
        if (!wire || !provider) return { wire };
        return { wire, sub: toSubscription(wire, await loadCatalog(provider)) };
    };

    /** The provider of the subscription in force, if there is one. */
    const heldProvider = async (): Promise<PaymentProvider | undefined> => {
        const { sub } = await readMine();
        return sub && sub.status !== 'expired' ? sub.provider : undefined;
    };

    /** A subscription the server answered with, read against its provider's catalog. */
    const subscriptionOf = async (view: SubscriptionWire): Promise<Subscription | undefined> => {
        const provider = providerOfPlatform(view.platform);
        return provider ? toSubscription(view, await loadCatalog(provider)) : undefined;
    };

    const getSession = async (): Promise<Account | null> => {
        const user = lost ? null : session.user();
        if (!user) return null;
        let membership: MembershipWire | undefined;
        try {
            membership = await call(server => server.fetchMembershipInfo());
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
        const [{ wire, sub }, account] = await Promise.all([readMine(), requireSession()]);
        if (!wire || !sub || (sub.status !== 'trial' && sub.status !== 'active')) {
            return fail('conflict', 'no subscription that can change plan');
        }
        // A plan changes within the provider that charges it.
        const plans = await loadCatalog(sub.provider);
        const from = plans.find(plan => plan.id === sub.planId) as CatalogPlan;
        const to = await catalogPlan(planId, sub.provider);
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
        payer: Payer | undefined
    ): Promise<RegistrationResult> => {
        if (result.outcome !== 'registered') return { outcome: result.outcome };
        if (purpose !== 'start') {
            await call(server => server.addCard({ billingKey: result.billingKey, ...payer }));
        }
        return { outcome: 'registered', card: result.billingKey as CardToken };
    };

    const listPaymentMethods = async (): Promise<PaymentMethod[]> => {
        const cards = await call(server => server.fetchSubscriptionCards());
        const today = new Date(now());
        return (cards ?? [])
            .map(card => toPaymentMethod(card, today))
            .filter((card): card is NonNullable<typeof card> => !!card);
    };

    /** A first subscription to `planId` with `provider`: the trial, if the account may have one, and the charges. */
    const checkoutPreview = async (planId: PlanId, provider: PaymentProvider): Promise<CheckoutPreview> => {
        const [plan, account, { wire }] = await Promise.all([
            catalogPlan(planId, provider),
            requireSession(),
            readMine(),
        ]);
        // The server says whether its checkout would start a trial; a server that does not say is read
        // off the trial-used flags, as before.
        const eligible = account.trialEligible ?? (!account.trialUsed && !wire?.trialUsed);
        const withTrial = plan.trialDays > 0 && eligible;
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

        listPlans: async input => {
            if (lost || !session.user()) return planCatalogIn(input?.currency ?? 'KRW');
            const provider = input?.currency ? providerOfCurrency(input.currency) : await heldProvider();
            return (await loadCatalog(provider ?? 'portone')).map(toPlan);
        },

        listSubscriptions: async () => {
            const sub = await readMineWithCard();
            return sub ? [sub] : [];
        },

        getSubscription: async id => {
            const sub = await readMineWithCard();
            return sub && sub.id === id ? sub : fail('notFound', `no subscription ${id}`);
        },

        previewCheckout: (planId, input) => checkoutPreview(planId, providerOfCurrency(input?.currency ?? 'KRW')),

        startPaymentMethodRegistration: async ({ purpose, planId, country, payer }) => {
            // The window is opened for a product, whose platform picks the payment provider: a checkout's
            // from its billing country, a card added on its own the provider of the account's subscription
            // record, expired or not — the server adds a card to that record's provider only — or the
            // first plan's if there is none.
            const held = planId ? undefined : (await readMine()).wire;
            const provider = planId
                ? providerOfCountry(country ?? KOREA)
                : (providerOfPlatform(held?.platform) ?? (country ? providerOfCountry(country) : 'portone'));
            const productId = planId
                ? (await catalogPlan(planId, provider)).productId
                : (planOfProduct(await loadCatalog(provider), held?.productId)?.productId ??
                  (await loadCatalog(provider))[0]?.productId);
            if (!productId) return fail('notFound', 'no product to register a card for');
            // A payer the provider is known to need is checked before anything is asked of the server; the
            // `issue` answer's own list is checked again after, and the server checks once more when the
            // card arrives. A payer missing would only open the window to fail behind it.
            if (payerRequiredFor(provider) && missingPayerFields(['name', 'phone', 'email'], payer).length > 0) {
                return fail('invalid', 'payer name, phone and email required');
            }
            const issue = toIssue(await call(server => server.issueBillingKey(productId)));
            if (!issue) return fail('conflict', 'the server answered with no card registration this side can open');
            const missing = missingPayerFields(issue.required, payer);
            if (missing.length > 0) return fail('invalid', `payer ${missing.join(', ')} required`);
            // Only a card field of ours states the terms, so only then are they worked out. A card added on
            // its own is charged only once it is the default, so its consent states no date or amount.
            const terms: CardEntryTerms =
                issue.provider === 'stripe' && planId
                    ? await checkoutPreview(planId, provider).then(preview => ({
                          amount: preview.plan.monthly,
                          firstChargeAt: preview.firstChargeAt,
                          withTrial: preview.withTrial,
                      }))
                    : {};
            const redirectUrl = `${options.origin}${returnPathOf(purpose, planId)}`;
            let outcome: PaymentWindowResult;
            try {
                outcome = await paymentWindow({ issue, payer, purpose, planId, country, terms, redirectUrl });
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

        startCheckout: async ({ planId, country, payer, card }) => {
            const plan = await catalogPlan(planId, providerOfCountry(country));
            const body = card
                ? { productId: plan.productId, billingKey: card, ...payer }
                : { productId: plan.productId };
            try {
                const view = await send(server => server.startSubscription(body));
                const sub = await subscriptionOf(view);
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
            const { sub } = await readMine();
            const plan = await catalogPlan(planId, sub?.provider ?? 'portone');
            try {
                const view = await send(server => server.changeSubscription(plan.productId));
                if (preview.kind === 'downgrade') {
                    return { scheduled: true as const, effectiveAt: dayOf(view.validUntil) ?? preview.effectiveAt };
                }
                return attemptFromSubscription({ purpose: 'upgrade', withTrial: false }, await subscriptionOf(view), {
                    unread: true,
                });
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
            const view = await call(server => server.cancelSubscription());
            return (await subscriptionOf(view)) ?? fail('notFound', `no subscription ${id}`);
        },

        listPaymentMethods,

        // The payment service decides what can change — it refuses to remove the default card or the
        // card a subscription in use is charged to — and answers the card it changed; the list is read
        // again either way, since a new default changes two cards at once.
        setDefaultPaymentMethod: async id => {
            await call(server => server.setDefaultCard(id));
            return listPaymentMethods();
        },

        removePaymentMethod: async id => {
            await call(server => server.removeCard(id));
            return listPaymentMethods();
        },
    };
};
