import { isAdminOverrideActive, resolveEffectiveProductId } from '@chatic/shared';

import type { MembershipView, ProductView } from '@lemoncloud/chatic-backend-api';

/**
 * The five states the plan defines. Nothing else is a state.
 *
 * `blocked` is an operator shutting the subscription off from the console (ADR-0082), and it is
 * deliberately not folded into `expired`: the store keeps charging through a block, so telling
 * that user their subscription "expired" is wrong in the direction that produces support tickets.
 */
export type SubscriptionState = 'none' | 'active' | 'cancelScheduled' | 'expired' | 'blocked';

export interface SubscriptionSummary {
    state: SubscriptionState;
    /** A paid period is still running, so the cloud allowance holds. `active` | `cancelScheduled`. */
    isEntitled: boolean;
    /** An admin override is deciding this summary rather than the receipt. */
    isAdminOverridden?: boolean;
    /**
     * The store still holds a running subscription for this user.
     *
     * Separate from `isEntitled` because an override breaks the two apart in both directions: a
     * grant on a lapsed receipt is entitled with nothing at the store, and a block leaves the store
     * charging while entitlement is gone. Anything that talks to the store — replacing a plan,
     * naming an `oldPlanId` — has to follow this, not entitlement.
     */
    hasLiveReceipt: boolean;
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
 * Collapses a membership into the five states the screens branch on.
 *
 * The admin override is read first and wins, matching the relay. Everything below it is the
 * receipt's story.
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
        // The receipt's own story, told independently of any override laid over it.
        hasLiveReceipt: !!membership?.productId && (membership.validUntil ?? 0) > now,
    };

    // The admin override wins over the receipt, exactly as the relay's own derivation does.
    // Judged from the raw `adminStatus`/`adminUntil` rather than the stored `status`: the relay
    // derives `status` once at write time and nothing sweeps it afterwards, so a lapsed grant
    // still reads `active` there. Comparing `adminUntil` to `now` is right the moment it passes.
    //
    // This replaces the old `isSuper` shortcut. That flag was the previous spelling of an
    // indefinite grant; the relay stopped reading it in 2026-08 and its holders were migrated onto
    // overrides, so honouring it here would only keep a second, staler axis alive.
    if (isAdminOverrideActive(membership, now)) {
        const isGranted = membership?.adminStatus === 'active';

        return {
            ...base,
            // A grant raises the grade the allowance is read from; a block only takes entitlement
            // away. `resolveEffectiveProductId` mirrors the relay and would hand back a grade left
            // over from an earlier grant, which would then be shown as this user's tier.
            productId: isGranted ? resolveEffectiveProductId(membership, now) : base.productId,
            state: isGranted ? 'active' : 'blocked',
            isEntitled: isGranted,
            isAdminOverridden: true,
        };
    }

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
