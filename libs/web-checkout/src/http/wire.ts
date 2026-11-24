import { toIsoDate } from '../calendar';

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
} from '../types';

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

export interface CardWire {
    id?: string;
    provider?: string;
    cardIssuer?: string;
    cardNumber?: string;
    cardExpMonth?: number;
    cardExpYear?: number;
    isDefault?: boolean;
}

export interface MembershipWire {
    platform?: string;
    status?: string;
    productId?: string;
    validUntil?: number;
    trialUsed?: boolean;
    isValid?: boolean;
    trialEligible?: boolean;
    $subscription?: SubscriptionWire;
}

export interface IssueWire {
    provider?: string;
    storeId?: string;
    channelKey?: string;
    publishableKey?: string;
    clientSecret?: string;
    customerId?: string;
    issueId?: string;
    issueName?: string;
    required?: string[];
}

export type PayerField = keyof Payer;

interface IssueBase {
    customerId: string;
    issueId: string;
    issueName: string;
    required: PayerField[];
}

export interface PortOneIssue extends IssueBase {
    provider: 'portone';
    storeId: string;
    channelKey: string;
}

export interface StripeIssue extends IssueBase {
    provider: 'stripe';
    publishableKey: string;
    clientSecret: string;
}

export type Issue = PortOneIssue | StripeIssue;

const PAYER_FIELDS: PayerField[] = ['name', 'phone', 'email'];

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

export const missingPayerFields = (required: PayerField[], payer: Partial<Payer> | undefined): PayerField[] =>
    required.filter(field => !payer?.[field]?.trim());

export interface CatalogPlan extends Plan {
    productId: string;
    provider: PaymentProvider;
}

export const providerOfPlatform = (platform: string | undefined): PaymentProvider | undefined =>
    platform === 'portone' || platform === 'stripe' ? platform : undefined;

export const webSubscriptionOf = (membership: MembershipWire | undefined): SubscriptionWire | undefined => {
    const record = membership?.$subscription;
    return providerOfPlatform(record?.platform) ? record : undefined;
};

export const bareProductId = (id: string | undefined): string => (id ?? '').replace(/^#/, '');

export const toCatalogPlan = (product: ProductWire, provider: PaymentProvider): CatalogPlan | undefined => {
    const sort = product.sort;
    if (sort !== 1 && sort !== 2 && sort !== 3 && sort !== 4 && sort !== 5) return undefined;
    if (!product.id || typeof product.price !== 'number') return undefined;
    if (product.platform && providerOfPlatform(product.platform) !== provider) return undefined;
    return {
        id: `pro-tier-0${sort}` as PlanId,
        sort,
        maxClouds: product.maxClouds ?? sort,
        monthly: { amount: product.price, currency: product.currency === 'USD' ? 'USD' : 'KRW' },
        trialDays: product.trialDays ?? 0,
        productId: bareProductId(product.id),
        provider,
    };
};

export const toCatalog = (products: ProductWire[], provider: PaymentProvider): CatalogPlan[] =>
    products
        .map(product => toCatalogPlan(product, provider))
        .filter((plan): plan is CatalogPlan => !!plan)
        .sort((a, b) => a.sort - b.sort);

export const planOfProduct = (catalog: CatalogPlan[], productId: string | undefined): CatalogPlan | undefined =>
    catalog.find(plan => plan.productId === bareProductId(productId));

export const toPlan = ({ productId: _productId, provider: _provider, ...plan }: CatalogPlan): Plan => plan;

const STATUS: Record<SubscriptionStatusWire, SubscriptionStatus> = {
    pending: 'pending',
    trial: 'trial',
    active: 'active',
    canceling: 'cancelScheduled',
    expired: 'expired',
};

export const dayOf = (ms: number | undefined): string | undefined => (ms ? toIsoDate(new Date(ms)) : undefined);

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

export const isExpiringSoon = (expMonth: number, expYear: number, today: Date): boolean =>
    expYear * 12 + expMonth - (today.getFullYear() * 12 + today.getMonth() + 1) <= 1;

export const toPaymentMethod = (card: CardWire, today: Date): PaymentMethod | undefined => {
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

export const billingSourceOf = (membership: MembershipWire | undefined): BillingSource => {
    if (!membership?.platform) return 'none';
    const live = membership.isValid ?? (membership.status === 'active' || membership.status === 'pending');
    if (!live) return 'none';
    return STORE_SOURCES[membership.platform] ?? 'web';
};

const STORE_PLAN = /^pro-tier-0[1-5]$/;

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
    if (typeof membership?.trialEligible === 'boolean') account.trialEligible = membership.trialEligible;
    const storePlan = bareProductId(membership?.productId);
    if ((billingSource === 'appStore' || billingSource === 'googlePlay') && STORE_PLAN.test(storePlan)) {
        account.storeSubscription = { planId: storePlan as PlanId, nextBillingAt: dayOf(membership?.validUntil) };
    }
    return account;
};

export const prorate = (from: Money, to: Money, periodFrom: number, periodUntil: number, now: number): Money => {
    const period = periodUntil - periodFrom;
    if (period <= 0) return { amount: 0, currency: to.currency };
    const left = Math.min(1, Math.max(0, (periodUntil - now) / period));
    return { amount: Math.max(0, Math.floor((to.amount - from.amount) * left)), currency: to.currency };
};

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
