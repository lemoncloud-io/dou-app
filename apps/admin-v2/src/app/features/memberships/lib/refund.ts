/**
 * `lib/memberships/refund.ts`
 * - When the web subscription refund may be offered, and how its failures read to an operator.
 *
 * The refund is full and immediate: the relay refunds the last paid charge and expires the
 * subscription on the spot, with no undo. So the screen is strict about where it fires and leaves
 * the question "is there a paid charge?" to the relay, which is the only side that can answer it.
 */
import { relayBaseFor, relayStageOf, type RelayStage } from './targetServer';

import type { MembershipView } from '@lemoncloud/chatic-backend-api';

/**
 * The payments-side platform a web subscription is recorded under. Store subscriptions (`apple`,
 * `google`) are refunded by the store, never from here.
 *
 * Compared as a string: the installed backend package's `MembershipPlatform` predates the web
 * subscription and has no `portone`.
 */
export const WEB_SUBSCRIPTION_PLATFORM = 'portone';

export const isWebSubscription = (membership: Pick<MembershipView, 'platform'>): boolean =>
    (membership.platform as string | undefined) === WEB_SUBSCRIPTION_PLATFORM;

/**
 * The relay a refund on `stage` is sent to, or `''` when it cannot be named with confidence.
 *
 * `relayBaseFor` would happily append `/dou-d1` to any host. That is fine for display elsewhere,
 * but a refund must not trust a URL the console made up: when the configured endpoint follows
 * neither `dou-v1` nor `dou-d1`, nothing says which server its host really is, so no endpoint is
 * produced and the gate below stays shut.
 */
export const refundEndpointFor = (configured: string | undefined, stage: RelayStage): string =>
    relayStageOf(configured) ? relayBaseFor(configured, stage) : '';

export interface RefundAvailability {
    enabled: boolean;
    /** Why the button is off, as one line under it. Absent when enabled. */
    reason?: string;
}

/**
 * Whether the refund button may be pressed, judged against the relay the call will actually hit.
 *
 * - **Development only.** Production refunds stay closed until a refund policy exists, and the
 *   console usually runs against production because that is what operators' `.env` names. An
 *   endpoint that is empty or names neither stage counts as "not Development" — guessing is the
 *   expensive direction to be wrong in. `refundEndpointFor` produces the endpoint this is given.
 * - **Only what the membership view can tell.** `pending` (first charge not yet confirmed) and
 *   `expired` are blocked here. A trial cannot be: the view carries no period axis and a trial reads
 *   `status: active`, so the button stays open and the relay's 409 "nothing to refund" is shown
 *   instead (see `describeRefundFailure`). The stored `status` is compared as a string because the
 *   installed package's `MembershipStatus` has no `pending`.
 */
export const refundAvailability = (
    membership: Pick<MembershipView, 'userId' | 'status'>,
    endpoint: string | undefined
): RefundAvailability => {
    if (!endpoint?.trim()) {
        return {
            enabled: false,
            reason: 'No relay to refund on — the configured endpoint must end in /dou-v1 or /dou-d1.',
        };
    }
    if (relayStageOf(endpoint) !== 'd1') {
        return { enabled: false, reason: 'Production refunds are not open yet — switch the stage to Development.' };
    }
    if (!membership.userId) {
        return { enabled: false, reason: 'This record has no userId to refund.' };
    }

    const status = membership.status as string | undefined;
    if (status === 'pending') {
        return { enabled: false, reason: 'The first charge is still being confirmed — nothing has been paid yet.' };
    }
    if (status === 'expired') {
        return { enabled: false, reason: 'Already expired — there is no running subscription to refund.' };
    }

    return { enabled: true };
};

/** The relay refuses an empty reason (400), so the dialog does too. */
export const isRefundReasonValid = (reason: string): boolean => reason.trim().length > 0;

/**
 * One line for a failed refund: what it means, then the relay's own words.
 *
 * The relay's message is always kept — an operator chasing a failure needs the exact text — but a
 * bare "409 CONFLICT - nothing to refund" does not say that a trial or an unconfirmed first charge
 * is the usual cause, so the known cases get a plain-language lead.
 */
export const describeRefundFailure = (error: unknown): string => {
    const raw = readServerMessage(error);
    const status = readStatus(error) ?? Number(raw.match(/^(\d{3})\b/)?.[1] ?? NaN);

    if (status === 409) {
        return `No paid charge to refund — a trial, a first charge still being confirmed, or already refunded. (${raw})`;
    }
    if (status === 404) {
        return `This user has no web subscription. (${raw})`;
    }
    if (status === 403) {
        return `Not allowed — this account is not an admin on the target server. (${raw})`;
    }
    return raw;
};

interface HttpLikeError {
    message?: string;
    status?: number;
    response?: { status?: number; data?: unknown };
}

const readStatus = (error: unknown): number | undefined => {
    const e = error as HttpLikeError | undefined;
    return e?.response?.status ?? e?.status;
};

// The relay answers errors as plain text (`409 CONFLICT - nothing to refund @…`); the transport's
// own `message` is only "Request failed with status code 409", so the body is preferred.
const readServerMessage = (error: unknown): string => {
    const e = error as HttpLikeError | undefined;
    const data = e?.response?.data;
    if (typeof data === 'string' && data.trim()) return data.trim();
    if (data && typeof data === 'object') {
        const text = (data as { message?: unknown; error?: unknown }).message ?? (data as { error?: unknown }).error;
        if (typeof text === 'string' && text.trim()) return text.trim();
    }
    return e?.message || 'The request failed.';
};
