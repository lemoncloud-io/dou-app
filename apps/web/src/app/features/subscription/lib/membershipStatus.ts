import type { MembershipView, ProductView } from '@lemoncloud/chatic-backend-api';

/** The four states the plan defines. Nothing else is a state. */
export type SubscriptionState = 'none' | 'active' | 'cancelScheduled' | 'expired';

export interface SubscriptionSummary {
    state: SubscriptionState;
    /** A paid period is still running, so the cloud allowance holds. `active` | `cancelScheduled`. */
    isEntitled: boolean;
    productId?: string;
    validUntil?: number;
    /** A tier change queued for the next renewal. */
    pendingProductId?: string;
    /** Days left in the free trial — only when it can be backed by both inputs (see below). */
    trialDaysLeft?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Trial length is a product value and the trial starts when the subscription does, so the end is
 * `validFrom + trialDays`. The receipt's `startedAt` means subtly different things per store, so a
 * result outside `(0, trialDays]` is treated as "the inputs disagree" and reported as unknown —
 * better silent than promising a trial length we cannot back.
 */
const resolveTrialDaysLeft = (
    membership: MembershipView,
    plan: ProductView | undefined,
    now: number
): number | undefined => {
    const trialDays = plan?.trialDays ?? 0;
    if (trialDays <= 0 || !membership.trialUsed || !membership.validFrom) return undefined;
    const left = Math.ceil((membership.validFrom + trialDays * DAY_MS - now) / DAY_MS);
    return left > 0 && left <= trialDays ? left : undefined;
};

/**
 * Collapses a membership into the four states the screens branch on.
 *
 * Entitlement deliberately does NOT use the server's `isValid`. That flag turns false the moment a
 * cancellation is recorded (`proxy.ts:717`: `canceledAt > 0` → false), but a scheduled cancellation
 * leaves the paid period running — reading `isValid` would zero the cloud allowance of someone who
 * has already paid for the month and flag their clouds as excess. The paid period is what decides.
 *
 * A payment-retry grace period is `active`, not a state of its own: the validity window has not
 * closed, and an app-side "N days after failure" cut would only disagree with the store.
 */
export const summarizeMembership = (
    membership: MembershipView | undefined,
    plan: ProductView | undefined,
    now: number
): SubscriptionSummary => {
    const base = {
        productId: membership?.productId || undefined,
        validUntil: membership?.validUntil || undefined,
        pendingProductId: membership?.pendingProductId || undefined,
    };

    // A super membership is granted rather than purchased: no product, no expiry to read.
    if (membership?.isSuper) return { ...base, state: 'active', isEntitled: true };
    if (!membership?.productId || membership.status === 'none') return { ...base, state: 'none', isEntitled: false };

    if ((membership.validUntil ?? 0) > now) {
        // The backend folds a scheduled cancellation into `status='canceled'` + `canceledAt`
        // (`calcPurchaseStatus`); `autoRenewing === false` is the same signal from the receipt side.
        const isCancelScheduled = membership.status === 'canceled' || membership.autoRenewing === false;
        return {
            ...base,
            state: isCancelScheduled ? 'cancelScheduled' : 'active',
            isEntitled: true,
            trialDaysLeft: resolveTrialDaysLeft(membership, plan, now),
        };
    }

    return { ...base, state: 'expired', isEntitled: false };
};
