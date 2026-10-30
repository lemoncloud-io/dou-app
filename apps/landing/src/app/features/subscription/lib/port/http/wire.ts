import { toIsoDate } from '../../calendar';

import type {
    Account,
    AttemptPurpose,
    BillingSource,
    Money,
    Payer,
    PaymentAttempt,
    PaymentMethod,
    PaymentProvider,
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

/** A product from `GET /products/0/plans?platform=<provider>`. Prices are in the currency's minor unit. */
export interface ProductWire {
    id?: string;
    platform?: string;
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

/**
 * A card the payment server holds, for any of its providers. The list carries every provider's cards
 * and marks one default per provider. Only some providers report the expiry.
 */
export interface CardWire {
    id?: string;
    provider?: string;
    cardIssuer?: string;
    /** Masked as its provider gives it: `123412******5678`, `**** 4242`. */
    cardNumber?: string;
    cardExpMonth?: number;
    cardExpYear?: number;
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

/**
 * `IssueParams` as the server sends it — what a card is registered with, which differs by provider
 * (`provider`). Read loosely here and checked by `toIssue`.
 */
export interface IssueWire {
    provider?: string;
    storeId?: string;
    channelKey?: string;
    publishableKey?: string;
    /** The dollar provider's one-time secret for this registration. Never stored or logged. */
    clientSecret?: string;
    customerId?: string;
    issueId?: string;
    issueName?: string;
    /** The payer fields the provider requires with the card. */
    required?: string[];
}

export type PayerField = keyof Payer;

interface IssueBase {
    customerId: string;
    issueId: string;
    issueName: string;
    required: PayerField[];
}

/** The won provider's card window. */
export interface PortOneIssue extends IssueBase {
    provider: 'portone';
    storeId: string;
    channelKey: string;
}

/** The dollar provider's card field, opened in our own dialog. */
export interface StripeIssue extends IssueBase {
    provider: 'stripe';
    publishableKey: string;
    clientSecret: string;
}

export type Issue = PortOneIssue | StripeIssue;

const PAYER_FIELDS: PayerField[] = ['name', 'phone', 'email'];

/**
 * The server's `issue` answer as one of the two registrations, or `undefined` when it is neither. An
 * answer from before the server named providers is the won provider's. An answer that lists no required
 * payer fields gets its provider's own: every field for the won provider, none for the dollar one.
 */
export const toIssue = (wire: IssueWire | undefined): Issue | undefined => {
    if (!wire) return undefined;
    const provider = wire.provider ?? 'portone';
    const required = Array.isArray(wire.required)
        ? PAYER_FIELDS.filter(field => wire.required?.includes(field))
        : provider === 'portone'
          ? PAYER_FIELDS
          : [];
    const base = { customerId: wire.customerId ?? '', issueId: wire.issueId ?? '', issueName: wire.issueName ?? '' };
    if (provider === 'portone' && wire.storeId && wire.channelKey && base.issueId) {
        return { provider, storeId: wire.storeId, channelKey: wire.channelKey, required, ...base };
    }
    if (provider === 'stripe' && wire.publishableKey && wire.clientSecret) {
        return {
            provider,
            publishableKey: wire.publishableKey,
            clientSecret: wire.clientSecret,
            required,
            ...base,
        };
    }
    return undefined;
};

/** The payer fields a registration requires that `payer` leaves empty. */
export const missingPayerFields = (required: PayerField[], payer: Partial<Payer> | undefined): PayerField[] =>
    required.filter(field => !payer?.[field]?.trim());

/** A plan the screens know, beside the server product it is sold as and who sells it. */
export interface CatalogPlan extends Plan {
    productId: string;
    provider: PaymentProvider;
}

/** The server's payment platform as a provider this side knows; anything else is none. */
export const providerOfPlatform = (platform: string | undefined): PaymentProvider | undefined =>
    platform === 'portone' || platform === 'stripe' ? platform : undefined;

/** The server prefixes some product ids with `#`; both spellings name the same product. */
export const bareProductId = (id: string | undefined): string => (id ?? '').replace(/^#/, '');

/**
 * The web products are `dou-web-tier-0N` (with `_dev` on the dev stage), while the screens name a plan
 * `pro-tier-0N` after the app's products. The tier number — the product's `sort` — is what both agree
 * on, so it is the key; a product outside tiers 1 to 5 is not one the screens can sell.
 */
export const toCatalogPlan = (product: ProductWire, provider: PaymentProvider): CatalogPlan | undefined => {
    const sort = product.sort;
    if (sort !== 1 && sort !== 2 && sort !== 3 && sort !== 4 && sort !== 5) return undefined;
    if (!product.id || typeof product.price !== 'number') return undefined;
    // The list was asked for one provider's products; one that says it is another's is not sold here.
    if (product.platform && providerOfPlatform(product.platform) !== provider) return undefined;
    return {
        id: `pro-tier-0${sort}` as PlanId,
        sort,
        maxClouds: product.maxClouds ?? sort,
        // Carried as the server gives it — in the currency's minor unit, cents for dollars.
        monthly: { amount: product.price, currency: product.currency === 'USD' ? 'USD' : 'KRW' },
        trialDays: product.trialDays ?? 0,
        productId: bareProductId(product.id),
        provider,
    };
};

/** One provider's products as the plans it sells, by tier. */
export const toCatalog = (products: ProductWire[], provider: PaymentProvider): CatalogPlan[] =>
    products
        .map(product => toCatalogPlan(product, provider))
        .filter((plan): plan is CatalogPlan => !!plan)
        .sort((a, b) => a.sort - b.sort);

export const planOfProduct = (catalog: CatalogPlan[], productId: string | undefined): CatalogPlan | undefined =>
    catalog.find(plan => plan.productId === bareProductId(productId));

/** A plan as the screens take it, without the server id and the provider they never see. */
export const toPlan = ({ productId: _productId, provider: _provider, ...plan }: CatalogPlan): Plan => plan;

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
        provider: plan.provider,
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

const isMonth = (value: unknown): value is number =>
    typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 12;

/**
 * A card is expiring soon when its last valid month is this month or the next: the next monthly charge
 * may already fall after it.
 */
export const isExpiringSoon = (expMonth: number, expYear: number, today: Date): boolean =>
    expYear * 12 + expMonth - (today.getFullYear() * 12 + today.getMonth() + 1) <= 1;

/**
 * The payment server's card. Its default is the one its provider charges. A card of a provider this
 * side does not know is not one the screens can use, and is left out.
 */
export const toPaymentMethod = (card: CardWire, today: Date): PaymentMethod | undefined => {
    // A card from before the server named providers is the won provider's: it was the only one.
    const provider = card.provider ? providerOfPlatform(card.provider) : 'portone';
    if (!card.id || !provider) return undefined;
    const method: PaymentMethod = {
        id: card.id,
        provider,
        brand: card.cardIssuer ?? '',
        last4: (card.cardNumber ?? '').slice(-4),
        isDefault: !!card.isDefault,
    };
    if (isMonth(card.cardExpMonth) && typeof card.cardExpYear === 'number' && card.cardExpYear > 0) {
        method.expMonth = card.cardExpMonth;
        method.expYear = card.cardExpYear;
        method.expiringSoon = isExpiringSoon(card.cardExpMonth, card.cardExpYear, today);
    }
    return method;
};

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
