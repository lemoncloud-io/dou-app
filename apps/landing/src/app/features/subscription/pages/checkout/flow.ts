import { ROUTES } from '../../../../routes/paths';
import { KOREA, billableIn, isBillingCountry, payerRequiredIn } from '@chatic/web-checkout';
import { addDays } from '@chatic/web-checkout';
import { changeKindOf } from '@chatic/web-checkout';
import { type PayerDraft, isPayerComplete } from '../../lib/payer';
import { formatDate } from '../../utils';

import type {
    Account,
    AttemptPurpose,
    Invoice,
    Payer,
    PaymentAttempt,
    Plan,
    PlanId,
    RegistrationOutcome,
} from '@chatic/web-checkout';

export const planFromQuery = (plans: Plan[] | undefined, value: string | null): Plan | undefined =>
    value ? plans?.find(plan => plan.id === value) : undefined;

export { BILLING_COUNTRY_OPTIONS } from '@chatic/web-checkout';

export const CONSENTS = ['terms', 'privacy', 'autoRenew'] as const;
export type Consent = (typeof CONSENTS)[number];
export type Consents = Record<Consent, boolean>;

export const NO_CONSENTS: Consents = { terms: false, privacy: false, autoRenew: false };

export const allConsented = (consents: Consents): boolean => CONSENTS.every(key => consents[key]);

export const setAllConsents = (value: boolean): Consents => ({ terms: value, privacy: value, autoRenew: value });

export const canContinueCheckout = (input: {
    country: string;
    email?: string;
    payer: PayerDraft;
    consents: Consents;
    foreignBilling?: boolean;
}): boolean =>
    isBillingCountry(input.country) &&
    billableIn(input.country, input.foreignBilling ?? true) &&
    (!payerRequiredIn(input.country) || (!!input.email && isPayerComplete(input.payer))) &&
    allConsented(input.consents);

export const checkoutRouteFor = (
    current: Plan | undefined,
    target: Plan,
    account: Account | null
): 'checkout' | 'change' | 'plans' => {
    const kind = changeKindOf(current, target, account);
    if (kind === 'new') return 'checkout';
    if (kind === 'upgrade' || kind === 'downgrade') return 'change';
    return 'plans';
};

export interface CheckoutDetails {
    country: string;
    emailId?: string;
    payer?: Payer;
}

const isPayer = (value: unknown): value is Payer => {
    const payer = value as Partial<Payer> | undefined;
    return (
        !!payer && typeof payer.name === 'string' && typeof payer.phone === 'string' && typeof payer.email === 'string'
    );
};

export const checkoutDetailsOf = (state: unknown, foreignBilling = true): CheckoutDetails | undefined => {
    const details = (state as { checkout?: Partial<CheckoutDetails> } | null)?.checkout;
    if (!details || typeof details.country !== 'string' || !isBillingCountry(details.country)) return undefined;
    if (!billableIn(details.country, foreignBilling)) return undefined;
    if (payerRequiredIn(details.country) && !isPayer(details.payer)) return undefined;
    return {
        country: details.country,
        ...(typeof details.emailId === 'string' ? { emailId: details.emailId } : {}),
        ...(isPayer(details.payer) ? { payer: details.payer } : {}),
    };
};

export const handedAbroad = (state: unknown): boolean => {
    const country = (state as { checkout?: { country?: unknown } } | null)?.checkout?.country;
    return typeof country === 'string' && country !== KOREA;
};

export const withCheckoutDetails = (details: CheckoutDetails | undefined) =>
    details ? { state: { checkout: details } } : undefined;

const withQuery = (path: string, query: Record<string, string | undefined>): string => {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => value !== undefined && params.set(key, value));
    const search = params.toString();
    return search ? `${path}?${search}` : path;
};

export const checkoutEmailUrl = (planId: PlanId): string =>
    withQuery(ROUTES.subscription.checkoutEmail, { plan: planId });

export const checkoutUrl = (planId: PlanId): string => withQuery(ROUTES.subscription.checkout, { plan: planId });

export const checkoutPaymentUrl = (planId: PlanId): string =>
    withQuery(ROUTES.subscription.checkoutPayment, { plan: planId });

export const changePlanUrl = (planId: PlanId): string => withQuery(ROUTES.subscription.change, { plan: planId });

export const statusUrl = (attemptId: string, planId?: string): string =>
    withQuery(ROUTES.subscription.checkoutStatus, { attempt: attemptId, plan: planId });

export const registrationOutcomeUrl = (planId: PlanId, outcome: Exclude<RegistrationOutcome, 'registered'>): string =>
    withQuery(ROUTES.subscription.checkoutStatus, { plan: planId, outcome });

export const completeUrl = (attemptId: string, planId?: string): string =>
    withQuery(ROUTES.subscription.checkoutComplete, { attempt: attemptId, plan: planId });

export const DOWNGRADE_COMPLETE_URL = withQuery(ROUTES.subscription.checkoutComplete, { change: 'downgrade' });

export type AttemptVariant = 'card' | 'payment' | 'upgrade' | 'retry';

export const attemptVariantOf = (purpose: AttemptPurpose, withTrial: boolean | undefined): AttemptVariant => {
    if (purpose === 'upgrade') return 'upgrade';
    if (purpose === 'retry') return 'retry';
    if (purpose === 'addCard') return 'card';
    return withTrial ? 'card' : 'payment';
};

export type StatusScene =
    | { kind: 'processing'; variant: AttemptVariant }
    | { kind: 'failed'; variant: AttemptVariant; failure: NonNullable<PaymentAttempt['failure']> }
    | { kind: 'canceled'; variant: AttemptVariant }
    | { kind: 'retried' }
    | { kind: 'complete' }
    | { kind: 'cardAdded' };

export const statusSceneOf = (attempt: PaymentAttempt): StatusScene => {
    const variant = attemptVariantOf(attempt.purpose, attempt.withTrial);
    switch (attempt.status) {
        case 'processing':
            return { kind: 'processing', variant };
        case 'failed':
            return { kind: 'failed', variant, failure: attempt.failure ?? 'unknown' };
        case 'canceled':
            return { kind: 'canceled', variant };
        case 'succeeded':
            if (attempt.purpose === 'retry') return { kind: 'retried' };
            if (attempt.purpose === 'start' || attempt.purpose === 'upgrade') return { kind: 'complete' };
            return { kind: 'cardAdded' };
    }
};

export const registrationSceneOf = (
    outcome: string | null,
    withTrial: boolean | undefined
): Extract<StatusScene, { kind: 'failed' | 'canceled' }> | undefined => {
    if (outcome === 'failed') return { kind: 'failed', variant: 'card', failure: 'declined' };
    if (outcome === 'closed') return { kind: 'canceled', variant: withTrial ? 'card' : 'payment' };
    return undefined;
};

export const retryUrlOf = (variant: AttemptVariant, planId: PlanId | undefined): string => {
    switch (variant) {
        case 'card':
        case 'payment':
            return planId ? checkoutPaymentUrl(planId) : ROUTES.subscription.plans;
        case 'upgrade':
            return planId ? changePlanUrl(planId) : ROUTES.subscription.root;
        case 'retry':
            return ROUTES.subscription.paymentMethods;
    }
};

export type CompleteScene = 'trialStarted' | 'firstPayment' | 'upgraded';

export const completeSceneOf = (attempt: PaymentAttempt): CompleteScene | undefined => {
    if (attempt.status !== 'succeeded') return undefined;
    if (attempt.purpose === 'upgrade') return 'upgraded';
    if (attempt.purpose === 'start') return attempt.withTrial ? 'trialStarted' : 'firstPayment';
    return undefined;
};

export const chargedToday = (
    invoices: Invoice[] | undefined,
    kind: Invoice['kind'],
    planId: PlanId,
    today: string
): Invoice | undefined =>
    invoices?.find(
        invoice =>
            invoice.kind === kind &&
            invoice.planId === planId &&
            invoice.status === 'paid' &&
            invoice.issuedAt.slice(0, 10) === today
    );

export const dayBefore = (iso: string): string => addDays(iso, -1);

export const formatShortDate = (iso: string): string => formatDate(iso).slice(5);
