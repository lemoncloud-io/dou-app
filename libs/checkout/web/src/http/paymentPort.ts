import {
    KOREA,
    addDays,
    changeKindOf,
    payerRequiredFor,
    planCatalogIn,
    providerOfCountry,
    providerOfCurrency,
    toIsoDate,
} from '@chatic/subscription';
import { SubscriptionPortError } from '../port/errors';
import { isDeclinedPayment, portErrorOf } from './errors';
import {
    type CardWire,
    type CatalogPlan,
    type Issue,
    type IssueWire,
    type MembershipWire,
    type ProductWire,
    type SubscriptionWire,
    attemptFromSubscription,
    attemptId,
    dayOf,
    missingPayerFields,
    parseAttemptId,
    planOfProduct,
    providerOfPlatform,
    prorate,
    toAccount,
    toCatalog,
    toIssue,
    toPaymentMethod,
    toPlan,
    toSubscription,
    webSubscriptionOf,
} from './wire';
import { windowResultOfQuery } from './windowReturn';

import type { HttpPort } from './methods';
import type { CardEntryTerms } from '../port/cardEntry';
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
} from '@chatic/subscription';

export interface SubscriptionApi {
    fetchPlans(params?: Record<string, unknown>): Promise<{ list?: ProductWire[] }>;
    fetchMembershipInfo(): Promise<MembershipWire>;
    fetchSubscriptionCards(query?: SandboxQuery): Promise<CardWire[]>;
    issueBillingKey(productId: string, query?: SandboxQuery): Promise<IssueWire>;
    startSubscription(
        body: { productId: string; billingKey?: string } & Partial<Payer>,
        query?: SandboxQuery & { interval?: string }
    ): Promise<SubscriptionWire>;
    changeSubscription(productId: string): Promise<SubscriptionWire>;
    cancelSubscription(): Promise<SubscriptionWire>;
    addCard(body: { billingKey: string } & Partial<Payer>, query?: SandboxQuery): Promise<CardWire>;
    setDefaultCard(billkeyId: string, query?: SandboxQuery): Promise<CardWire>;
    removeCard(billkeyId: string, query?: SandboxQuery): Promise<CardWire>;
}

export interface SandboxQuery {
    sandbox?: 1;
}

export interface HttpSandbox {
    interval(): string | undefined;
}

export type PaymentWindowResult = { outcome: 'registered'; billingKey: string } | { outcome: 'failed' | 'closed' };

export type PaymentWindow = (request: {
    issue: Issue;
    payer?: Payer;
    purpose: AttemptPurpose;
    planId?: PlanId;
    country?: string;
    terms: CardEntryTerms;
    redirectUrl: string;
}) => Promise<PaymentWindowResult>;

export interface PaymentSession {
    user(): Record<string, unknown> | null;
}

export interface PaymentPortOptions {
    api: SubscriptionApi;
    session: PaymentSession;
    paymentWindow: PaymentWindow;
    returnUrl: (purpose: AttemptPurpose, planId: PlanId | undefined) => string;
    signInProvider?: () => SignInProvider;
    sandbox?: HttpSandbox;
    now?: () => number;
}

export type SignInMethod = 'startSignIn' | 'completeSignIn' | 'signOut';

export type PaymentMethods = Omit<HttpPort, SignInMethod>;

export interface PaymentPort extends PaymentMethods {
    requireSession(): Promise<Account>;
    setSessionLost(lost: boolean): void;
}

const fail = (code: SubscriptionPortError['code'], message?: string, detail?: SubscriptionPortError['detail']) => {
    throw new SubscriptionPortError(code, message, detail);
};

export const createPaymentPort = (options: PaymentPortOptions): PaymentPort => {
    const { api, session, paymentWindow, sandbox } = options;
    const payerQuery: SandboxQuery | undefined = sandbox ? { sandbox: 1 } : undefined;
    const startQuery = () => (sandbox ? { sandbox: 1 as const, interval: sandbox.interval() } : undefined);
    const now = options.now ?? (() => Date.now());

    let lost = false;
    const catalogs = new Map<PaymentProvider, Promise<CatalogPlan[]>>();

    const send = <T>(work: (server: SubscriptionApi) => Promise<T>): Promise<T> => {
        if (lost || !session.user()) return Promise.reject(new SubscriptionPortError('unauthenticated', 'no session'));
        return work(api);
    };

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

    const readMineWithCard = async (): Promise<Subscription | undefined> => {
        const { sub } = await readMine();
        if (!sub || sub.status === 'expired') return sub;
        const cards = await call(server => server.fetchSubscriptionCards(payerQuery));
        const card = (cards ?? [])
            .map(each => toPaymentMethod(each, new Date(now())))
            .find(each => each?.isDefault && each.provider === sub.provider);
        return card ? { ...sub, defaultPaymentMethodId: card.id } : sub;
    };

    const fetchMembership = async (): Promise<MembershipWire | undefined> => {
        try {
            return await call(server => server.fetchMembershipInfo());
        } catch (error) {
            if ((error as SubscriptionPortError).code !== 'notFound') throw error;
            return undefined;
        }
    };

    let membershipRead: Promise<MembershipWire | undefined> | undefined;
    const readMembership = (): Promise<MembershipWire | undefined> => {
        membershipRead ??= fetchMembership().finally(() => {
            membershipRead = undefined;
        });
        return membershipRead;
    };

    const readMine = async (): Promise<{
        membership?: MembershipWire;
        wire?: SubscriptionWire;
        sub?: Subscription;
    }> => {
        const membership = await readMembership();
        const wire = webSubscriptionOf(membership);
        const provider = providerOfPlatform(wire?.platform);
        if (!wire || !provider) return { membership, wire };
        return { membership, wire, sub: toSubscription(wire, await loadCatalog(provider)) };
    };

    const heldProvider = async (): Promise<PaymentProvider | undefined> => {
        const { sub } = await readMine();
        return sub && sub.status !== 'expired' ? sub.provider : undefined;
    };

    const subscriptionOf = async (view: SubscriptionWire): Promise<Subscription | undefined> => {
        const provider = providerOfPlatform(view.platform);
        return provider ? toSubscription(view, await loadCatalog(provider)) : undefined;
    };

    const accountOf = (membership: MembershipWire | undefined): Account => {
        const user = lost ? null : session.user();
        if (!user) return fail('unauthenticated');
        const provider = options.signInProvider?.() ?? 'google';
        return toAccount({ user, provider, membership });
    };

    const getSession = async (): Promise<Account | null> => {
        if (lost || !session.user()) return null;
        try {
            return accountOf(await readMembership());
        } catch (error) {
            if ((error as SubscriptionPortError).code === 'unauthenticated') return null;
            throw error;
        }
    };

    const requireSession = async (): Promise<Account> => (await getSession()) ?? fail('unauthenticated');

    type Mine = Awaited<ReturnType<typeof readMine>>;

    const changePreviewOf = async (
        planId: PlanId,
        { membership, wire, sub }: Mine
    ): Promise<{ preview: ChangePreview; target: CatalogPlan }> => {
        const account = accountOf(membership);
        if (!wire || !sub || (sub.status !== 'trial' && sub.status !== 'active')) {
            return fail('conflict', 'no subscription that can change plan');
        }
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
        else if (direction === 'upgrade' && sub.status === 'trial') preview.blocked = 'trialUpgrade';
        return { preview, target: to };
    };

    const previewChange = async (planId: PlanId): Promise<ChangePreview> =>
        (await changePreviewOf(planId, await readMine())).preview;

    const registered = async (
        result: PaymentWindowResult,
        purpose: AttemptPurpose,
        payer: Payer | undefined
    ): Promise<RegistrationResult> => {
        if (result.outcome !== 'registered') return { outcome: result.outcome };
        if (purpose !== 'start') {
            await call(server => server.addCard({ billingKey: result.billingKey, ...payer }, payerQuery));
        }
        return { outcome: 'registered', card: result.billingKey as CardToken };
    };

    const listPaymentMethods = async (): Promise<PaymentMethod[]> => {
        const cards = await call(server => server.fetchSubscriptionCards(payerQuery));
        const today = new Date(now());
        return (cards ?? [])
            .map(card => toPaymentMethod(card, today))
            .filter((card): card is NonNullable<typeof card> => !!card);
    };

    const checkoutPreview = async (planId: PlanId, provider: PaymentProvider): Promise<CheckoutPreview> => {
        const [plan, { membership, wire }] = await Promise.all([catalogPlan(planId, provider), readMine()]);
        const account = accountOf(membership);
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
        requireSession,
        setSessionLost: value => {
            lost = value;
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
            const held = planId ? undefined : (await readMine()).wire;
            const provider = planId
                ? providerOfCountry(country ?? KOREA)
                : (providerOfPlatform(held?.platform) ?? (country ? providerOfCountry(country) : 'portone'));
            const productId = planId
                ? (await catalogPlan(planId, provider)).productId
                : (planOfProduct(await loadCatalog(provider), held?.productId)?.productId ??
                  (await loadCatalog(provider))[0]?.productId);
            if (!productId) return fail('notFound', 'no product to register a card for');
            if (payerRequiredFor(provider) && missingPayerFields(['name', 'phone', 'email'], payer).length > 0) {
                return fail('invalid', 'payer name, phone and email required');
            }
            const issue = toIssue(await call(server => server.issueBillingKey(productId, payerQuery)));
            if (!issue) return fail('conflict', 'the server answered with no card registration this side can open');
            const missing = missingPayerFields(issue.required, payer);
            if (missing.length > 0) return fail('invalid', `payer ${missing.join(', ')} required`);
            const terms: CardEntryTerms =
                issue.provider === 'stripe' && planId
                    ? await checkoutPreview(planId, provider).then(preview => ({
                          amount: preview.plan.monthly,
                          firstChargeAt: preview.firstChargeAt,
                          withTrial: preview.withTrial,
                      }))
                    : {};
            const redirectUrl = options.returnUrl(purpose, planId);
            let outcome: PaymentWindowResult;
            try {
                outcome = await paymentWindow({ issue, payer, purpose, planId, country, terms, redirectUrl });
            } catch (error) {
                console.warn('payment window failed to open', error);
                throw error;
            }
            return registered(outcome, purpose, payer);
        },

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
                const view = await send(server => server.startSubscription(body, startQuery()));
                const sub = await subscriptionOf(view);
                return attemptFromSubscription({ purpose: 'start', withTrial: view.status === 'trial' }, sub, {
                    unread: true,
                });
            } catch (error) {
                if (isDeclinedPayment(error)) return failedAttempt('start', false);
                throw lostIf(portErrorOf(error));
            }
        },

        getPaymentAttempt: async id => {
            const attempt = parseAttemptId(id) ?? fail('notFound', `no attempt ${id}`);
            if (attempt.status === 'processing') return attemptFromSubscription(attempt, (await readMine()).sub);
            if (attempt.status !== 'succeeded') return attempt;
            const { sub } = await readMine();
            return sub ? { ...attempt, subscriptionId: sub.id } : attempt;
        },

        previewChange,

        changePlan: async planId => {
            const { preview, target } = await changePreviewOf(planId, await readMine());
            if (preview.blocked) return fail('conflict', `change blocked: ${preview.blocked}`);
            try {
                const view = await send(server => server.changeSubscription(target.productId));
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
                throw lostIf(portErrorOf(error));
            }
        },

        cancelSubscription: async id => {
            const view = await call(server => server.cancelSubscription());
            return (await subscriptionOf(view)) ?? fail('notFound', `no subscription ${id}`);
        },

        listPaymentMethods,

        setDefaultPaymentMethod: async id => {
            await call(server => server.setDefaultCard(id, payerQuery));
            return listPaymentMethods();
        },

        removePaymentMethod: async id => {
            await call(server => server.removeCard(id, payerQuery));
            return listPaymentMethods();
        },
    };
};
