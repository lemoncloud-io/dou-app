import { toIsoDate } from '../../calendar';

import type {
    Account,
    AttemptPurpose,
    BillingSource,
    Money,
    PaymentAttempt,
    PaymentMethod,
    Plan,
    PlanId,
    Subscription,
    SubscriptionStatus,
} from '../../../types';

/**
 * The subscription server's shapes, as far as the screens need them, and their translation into the
 * view types. Everything here is pure: what the server says goes in, what a screen draws comes out.
 *
 * The server's types are not imported — its package does not carry the web subscription yet — so the
 * fields read here are written down from its contract, and only those.
 */

/** A product from `GET /products/0/plans?platform=portone`. */
export interface ProductWire {
    id?: string;
    sort?: number;
    maxClouds?: number;
    price?: number;
    currency?: string;
    trialDays?: number;
}

export type SubscriptionStatusWire = 'pending' | 'trial' | 'active' | 'canceling' | 'expired';

/** `SubscriptionView`. Times are epoch milliseconds. */
export interface SubscriptionWire {
    id?: string;
    platform?: string;
    status?: SubscriptionStatusWire;
    productId?: string;
    pendingProductId?: string;
    validFrom?: number;
    validUntil?: number;
    autoRenewing?: boolean;
    trialUsed?: boolean;
}

/** `BillkeyView` — the payment server's card. It has no expiry. */
export interface CardWire {
    id?: string;
    cardIssuer?: string;
    /** Masked: `123412******5678`. */
    cardNumber?: string;
    isDefault?: boolean;
}

/** `MembershipView` — who bills the account today, and whether a trial was ever used. */
export interface MembershipWire {
    platform?: string;
    status?: string;
    productId?: string;
    validUntil?: number;
    trialUsed?: boolean;
    isValid?: boolean;
}

/** `IssueParams` — what the payment window opens with. */
export interface IssueParams {
    storeId: string;
    channelKey: string;
    customerId: string;
    issueId: string;
    issueName: string;
}

/** A plan the screens know, beside the server product it is sold as. */
export interface CatalogPlan extends Plan {
    productId: string;
}

/** The server prefixes some product ids with `#`; both spellings name the same product. */
export const bareProductId = (id: string | undefined): string => (id ?? '').replace(/^#/, '');

/**
 * The web products are `dou-web-tier-0N` (with `_dev` on the dev stage), while the screens name a plan
 * `pro-tier-0N` after the app's products. The tier number — the product's `sort` — is what both agree
 * on, so it is the key; a product outside tiers 1 to 5 is not one the screens can sell.
 */
export const toCatalogPlan = (product: ProductWire): CatalogPlan | undefined => {
    const sort = product.sort;
    if (sort !== 1 && sort !== 2 && sort !== 3 && sort !== 4 && sort !== 5) return undefined;
    if (!product.id || typeof product.price !== 'number') return undefined;
    return {
        id: `pro-tier-0${sort}` as PlanId,
        sort,
        maxClouds: product.maxClouds ?? sort,
        monthly: { amount: product.price, currency: product.currency === 'USD' ? 'USD' : 'KRW' },
        trialDays: product.trialDays ?? 0,
        productId: bareProductId(product.id),
    };
};

export const toCatalog = (products: ProductWire[]): CatalogPlan[] =>
    products
        .map(toCatalogPlan)
        .filter((plan): plan is CatalogPlan => !!plan)
        .sort((a, b) => a.sort - b.sort);

export const planOfProduct = (catalog: CatalogPlan[], productId: string | undefined): CatalogPlan | undefined =>
    catalog.find(plan => plan.productId === bareProductId(productId));

/** A plan as the screens take it, without the server id they never see. */
export const toPlan = ({ productId: _productId, ...plan }: CatalogPlan): Plan => plan;

const STATUS: Record<SubscriptionStatusWire, SubscriptionStatus> = {
    pending: 'pending',
    trial: 'trial',
    active: 'active',
    canceling: 'cancelScheduled',
    expired: 'expired',
};

/** An instant as the calendar day the reader is in. */
export const dayOf = (ms: number | undefined): string | undefined => (ms ? toIsoDate(new Date(ms)) : undefined);

/**
 * One subscription as the screens draw it. The server keeps one per account and payment platform and
 * marks a period with two instants, so the dates the screens want are read off `validUntil`: the end
 * of a trial, the next charge, the last day of a cancelled subscription or the day it expired.
 */
export const toSubscription = (wire: SubscriptionWire, catalog: CatalogPlan[]): Subscription | undefined => {
    const plan = planOfProduct(catalog, wire.productId);
    const status = wire.status && STATUS[wire.status];
    if (!wire.id || !plan || !status) return undefined;
    const until = dayOf(wire.validUntil);
    const startedAt = dayOf(wire.validFrom) ?? until ?? toIsoDate(new Date());
    const pending = planOfProduct(catalog, wire.pendingProductId);
    const sub: Subscription = {
        id: wire.id,
        planId: plan.id,
        status,
        startedAt,
        billingDay: Number((until ?? startedAt).slice(8, 10)),
    };
    if (status === 'trial' || status === 'active') {
        sub.nextBillingAt = until;
        sub.nextAmount = (pending ?? plan).monthly;
    }
    if (status === 'trial') sub.trialEndsAt = until;
    if (status === 'active' && pending && until) sub.pendingChange = { planId: pending.id, effectiveAt: until };
    if (status === 'cancelScheduled') sub.endsAt = until;
    if (status === 'expired') sub.expiredAt = until;
    return sub;
};

/** The payment server's card. The default is the one the subscription is charged to. */
export const toPaymentMethod = (card: CardWire): PaymentMethod | undefined =>
    card.id
        ? {
              id: card.id,
              brand: card.cardIssuer ?? '',
              last4: (card.cardNumber ?? '').slice(-4),
              isDefault: !!card.isDefault,
          }
        : undefined;

const STORE_SOURCES: Record<string, BillingSource> = { apple: 'appStore', google: 'googlePlay' };

/** Who bills the account: a store, the web, or nobody yet — read off the membership. */
export const billingSourceOf = (membership: MembershipWire | undefined): BillingSource => {
    if (!membership?.platform) return 'none';
    const live = membership.isValid ?? (membership.status === 'active' || membership.status === 'pending');
    if (!live) return 'none';
    return STORE_SOURCES[membership.platform] ?? 'web';
};

const STORE_PLAN = /^pro-tier-0[1-5]$/;

/**
 * The account as the screens see it. A store subscriber's plan comes from the store product, which
 * the app names the way the screens do (`#pro-tier-0N`).
 */
export const toAccount = (input: {
    user: Record<string, unknown>;
    provider: Account['provider'];
    membership: MembershipWire | undefined;
}): Account => {
    const { user, provider, membership } = input;
    const text = (value: unknown): string | undefined => (typeof value === 'string' && value ? value : undefined);
    const billingSource = billingSourceOf(membership);
    const account: Account = {
        id: text(user.id) ?? text(user.uid) ?? '',
        provider,
        email: text(user.email),
        displayName: text(user.name) ?? text(user.nick),
        billingSource,
        trialUsed: !!membership?.trialUsed,
    };
    const storePlan = bareProductId(membership?.productId);
    if ((billingSource === 'appStore' || billingSource === 'googlePlay') && STORE_PLAN.test(storePlan)) {
        account.storeSubscription = { planId: storePlan as PlanId, nextBillingAt: dayOf(membership?.validUntil) };
    }
    return account;
};

/**
 * The server prices an upgrade as the price difference for the part of the period left, rounded down
 * to the won (its `prorate`). The screens show this as an estimate: the charge itself is the server's.
 */
export const prorate = (from: Money, to: Money, periodFrom: number, periodUntil: number, now: number): Money => {
    const period = periodUntil - periodFrom;
    if (period <= 0) return { amount: 0, currency: to.currency };
    const left = Math.min(1, Math.max(0, (periodUntil - now) / period));
    return { amount: Math.max(0, Math.floor((to.amount - from.amount) * left)), currency: to.currency };
};

/**
 * The server has no payment attempt of its own: a checkout or an upgrade answers with the subscription
 * itself, and a payment it could not settle at once reads `pending` until the subscription is read
 * again. So an attempt id carries what the screens need to know about it, and a `processing` one is
 * settled by reading the subscription (`attemptFromSubscription`).
 */
export const attemptId = (attempt: Pick<PaymentAttempt, 'purpose' | 'status' | 'withTrial'>): string =>
    ['http', attempt.purpose, attempt.withTrial ? 'trial' : 'paid', attempt.status].join(':');

const PURPOSES: AttemptPurpose[] = ['start', 'upgrade', 'retry', 'addCard'];
const ATTEMPT_STATUSES: PaymentAttempt['status'][] = ['processing', 'succeeded', 'failed', 'canceled'];

export const parseAttemptId = (id: string): PaymentAttempt | undefined => {
    const [tag, purpose, trial, status] = id.split(':');
    if (tag !== 'http' || !PURPOSES.includes(purpose as AttemptPurpose)) return undefined;
    if (!ATTEMPT_STATUSES.includes(status as PaymentAttempt['status'])) return undefined;
    const attempt: PaymentAttempt = {
        id,
        purpose: purpose as AttemptPurpose,
        status: status as PaymentAttempt['status'],
        withTrial: trial === 'trial',
    };
    if (attempt.status === 'failed') attempt.failure = 'declined';
    return attempt;
};

/**
 * A payment attempt as the subscription it produced reports it. `unread` is a call that succeeded but
 * answered with a subscription this side could not read: it is followed as `processing`, so the next
 * read of the subscription decides, rather than reported as a declined card.
 */
export const attemptFromSubscription = (
    attempt: Pick<PaymentAttempt, 'purpose' | 'withTrial'>,
    sub: Subscription | undefined,
    options: { unread?: boolean } = {}
): PaymentAttempt => {
    const status: PaymentAttempt['status'] =
        !sub && options.unread
            ? 'processing'
            : !sub || sub.status === 'expired'
              ? 'failed'
              : sub.status === 'pending'
                ? 'processing'
                : 'succeeded';
    const settled: PaymentAttempt = {
        id: attemptId({ ...attempt, status }),
        purpose: attempt.purpose,
        status,
        withTrial: attempt.withTrial,
    };
    if (sub) settled.subscriptionId = sub.id;
    if (status === 'failed') settled.failure = 'declined';
    return settled;
};
