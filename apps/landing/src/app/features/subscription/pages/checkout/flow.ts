import { ROUTES } from '../../../../routes/paths';
import { addDays } from '../../lib/calendar';
import { changeKindOf } from '../../lib/changeKindOf';
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
} from '../../types';

/**
 * The checkout pages' own decisions: which of a screen's scenes to draw, and where each button goes.
 * What a plan may be changed to is not decided here — that is `changeKindOf` — this only turns its
 * answer, and a payment attempt's, into a scene and a URL.
 */

/** A `?plan=` value, if it names one of the plans the port offers. */
export const planFromQuery = (plans: Plan[] | undefined, value: string | null): Plan | undefined =>
    value ? plans?.find(plan => plan.id === value) : undefined;

// --- W-08 -----------------------------------------------------------------------------------------

/**
 * Billing countries the checkout can take today. Only Korea has a payment window behind it; picking
 * any other stops the checkout with a notice until overseas cards are supported.
 */
export const SUPPORTED_BILLING_COUNTRIES = ['KR'];

/** What the country picker offers. `OTHER` stands for every country not listed. */
export const BILLING_COUNTRY_OPTIONS = ['KR', 'US', 'JP', 'OTHER'] as const;

export const isSupportedCountry = (country: string): boolean => SUPPORTED_BILLING_COUNTRIES.includes(country);

export const CONSENTS = ['terms', 'privacy', 'autoRenew'] as const;
export type Consent = (typeof CONSENTS)[number];
export type Consents = Record<Consent, boolean>;

export const NO_CONSENTS: Consents = { terms: false, privacy: false, autoRenew: false };

export const allConsented = (consents: Consents): boolean => CONSENTS.every(key => consents[key]);

/** "Agree to all" ticks or clears every consent at once; each box can still be changed on its own after. */
export const setAllConsents = (value: boolean): Consents => ({ terms: value, privacy: value, autoRenew: value });

/**
 * The checkout continues only once the country is one it can bill, there is an address for the card
 * company, the payer is filled in, and every consent is given.
 */
export const canContinueCheckout = (input: {
    country: string;
    /** The address the card company is given: the verified billing email, or the account's own. */
    email?: string;
    payer: PayerDraft;
    consents: Consents;
}): boolean =>
    isSupportedCountry(input.country) && !!input.email && isPayerComplete(input.payer) && allConsented(input.consents);

/**
 * Where a request for `/subscription/checkout?plan=` belongs. A first subscription stays here; a
 * reader who already has one is changing plan, which is W-14; a plan that cannot be picked at all
 * goes back to the plan list.
 */
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

/**
 * What W-08 hands W-05 in the navigation state. Its presence is also the proof that the reader came
 * through W-08 — the consents are given there and nowhere else — so W-05 sends anyone without it back.
 */
export interface CheckoutDetails {
    country: string;
    /** The verified billing email the checkout used; absent while the billing-email screens are hidden. */
    emailId?: string;
    /** Who pays, for the payment window and the server. It lives in this state and nowhere else. */
    payer: Payer;
}

const isPayer = (value: unknown): value is Payer => {
    const payer = value as Partial<Payer> | undefined;
    return (
        !!payer && typeof payer.name === 'string' && typeof payer.phone === 'string' && typeof payer.email === 'string'
    );
};

export const checkoutDetailsOf = (state: unknown): CheckoutDetails | undefined => {
    const details = (state as { checkout?: Partial<CheckoutDetails> } | null)?.checkout;
    return details && typeof details.country === 'string' && isPayer(details.payer)
        ? {
              country: details.country,
              ...(typeof details.emailId === 'string' ? { emailId: details.emailId } : {}),
              payer: details.payer,
          }
        : undefined;
};

export const withCheckoutDetails = (details: CheckoutDetails | undefined) =>
    details ? { state: { checkout: details } } : undefined;

// --- URLs between the screens -----------------------------------------------------------------------

const withQuery = (path: string, query: Record<string, string | undefined>): string => {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => value !== undefined && params.set(key, value));
    const search = params.toString();
    return search ? `${path}?${search}` : path;
};

/** W-24, the email step a first checkout passes before W-08. */
export const checkoutEmailUrl = (planId: PlanId): string =>
    withQuery(ROUTES.subscription.checkoutEmail, { plan: planId });

export const checkoutUrl = (planId: PlanId): string => withQuery(ROUTES.subscription.checkout, { plan: planId });

export const checkoutPaymentUrl = (planId: PlanId): string =>
    withQuery(ROUTES.subscription.checkoutPayment, { plan: planId });

export const changePlanUrl = (planId: PlanId): string => withQuery(ROUTES.subscription.change, { plan: planId });

/**
 * W-09 for an attempt. `plan` is optional and only lets the screen name an amount while the attempt is
 * processing; a retry started from the payment methods page comes with the attempt alone.
 */
export const statusUrl = (attemptId: string, planId?: string): string =>
    withQuery(ROUTES.subscription.checkoutStatus, { attempt: attemptId, plan: planId });

/**
 * W-09 for a payment window that ended without a card. No attempt exists then — none is started until a
 * card is registered — so the screen is told the outcome instead.
 */
export const registrationOutcomeUrl = (planId: PlanId, outcome: Exclude<RegistrationOutcome, 'registered'>): string =>
    withQuery(ROUTES.subscription.checkoutStatus, { plan: planId, outcome });

export const completeUrl = (attemptId: string, planId?: string): string =>
    withQuery(ROUTES.subscription.checkoutComplete, { attempt: attemptId, plan: planId });

/** W-06 after a downgrade is scheduled: a downgrade charges nothing, so it has no attempt to name. */
export const DOWNGRADE_COMPLETE_URL = withQuery(ROUTES.subscription.checkoutComplete, { change: 'downgrade' });

// --- W-09 -----------------------------------------------------------------------------------------

/**
 * Which copy a W-09 scene uses. A first subscription with a trial charges nothing, so what is being
 * checked is the card (`card`); without a trial it is a payment (`payment`).
 */
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
    /** A retry that went through — W-09 shows it itself; there is no W-06 for a retry. */
    | { kind: 'retried' }
    /** A first subscription or an upgrade that went through: on to W-06. */
    | { kind: 'complete' }
    /** A card added on its own: nothing for W-06 to show, so back to the payment methods. */
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
            // Only what W-06 can draw goes there; anything else would bounce straight back here.
            if (attempt.purpose === 'start' || attempt.purpose === 'upgrade') return { kind: 'complete' };
            return { kind: 'cardAdded' };
    }
};

/**
 * The scene for a payment window that closed or failed before any attempt existed. A failed window
 * is a card the provider would not register, so it reads as a card failure whether or not a trial
 * was coming.
 */
export const registrationSceneOf = (
    outcome: string | null,
    withTrial: boolean | undefined
): Extract<StatusScene, { kind: 'failed' | 'canceled' }> | undefined => {
    if (outcome === 'failed') return { kind: 'failed', variant: 'card', failure: 'declined' };
    if (outcome === 'closed') return { kind: 'canceled', variant: withTrial ? 'card' : 'payment' };
    return undefined;
};

/**
 * Where "try again" goes: back to the screen the attempt was started from. A checkout reopens the
 * payment window (W-05), an upgrade its confirmation (W-14), a retry the payment methods (W-12). Without
 * the plan a checkout or an upgrade cannot be resumed, so it starts over from the plans or the list.
 */
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

// --- W-06 -----------------------------------------------------------------------------------------

export type CompleteScene = 'trialStarted' | 'firstPayment' | 'upgraded';

/** W-06's scene for a settled attempt, or `undefined` when there is nothing to celebrate yet. */
export const completeSceneOf = (attempt: PaymentAttempt): CompleteScene | undefined => {
    if (attempt.status !== 'succeeded') return undefined;
    if (attempt.purpose === 'upgrade') return 'upgraded';
    if (attempt.purpose === 'start') return attempt.withTrial ? 'trialStarted' : 'firstPayment';
    return undefined;
};

/**
 * The charge an attempt made today, read back from the invoices: the newest paid invoice of that kind,
 * for that plan, issued today. `undefined` when there is none — a trial upgrade charges nothing.
 */
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

// --- Dates ------------------------------------------------------------------------------------------

/**
 * The last day before `iso`. A trial "ending" on the 8th is charged on the 8th, so the reader's last
 * free day is the 7th; a downgrade applying on the 20th leaves the current plan through the 19th.
 */
export const dayBefore = (iso: string): string => addDays(iso, -1);

/** `11.20` — the short form the designs use inside a sentence or a range. */
export const formatShortDate = (iso: string): string => formatDate(iso).slice(5);
