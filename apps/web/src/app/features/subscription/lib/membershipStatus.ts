import { isAdminOverrideActive, resolveEffectiveProductId } from '@chatic/shared';

import type { MembershipView, ProductView } from '@lemoncloud/chatic-backend-api';

export type SubscriptionState = 'none' | 'active' | 'cancelScheduled' | 'expired' | 'blocked';

export interface SubscriptionSummary {
    state: SubscriptionState;
    isEntitled: boolean;
    isAdminOverridden?: boolean;
    hasLiveReceipt: boolean;
    productId?: string;
    validUntil?: number;
    pendingProductId?: string;
    trialDaysLeft?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

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

export const summarizeMembership = (
    membership: MembershipView | undefined,
    plan: ProductView | undefined,
    now: number
): SubscriptionSummary => {
    const base = {
        productId: membership?.productId || undefined,
        validUntil: membership?.validUntil || undefined,
        pendingProductId: membership?.pendingProductId || undefined,
        hasLiveReceipt: !!membership?.productId && (membership.validUntil ?? 0) > now,
    };

    if (isAdminOverrideActive(membership, now)) {
        const isGranted = membership?.adminStatus === 'active';

        return {
            ...base,
            productId: isGranted ? resolveEffectiveProductId(membership, now) : base.productId,
            state: isGranted ? 'active' : 'blocked',
            isEntitled: isGranted,
            isAdminOverridden: true,
        };
    }

    if (!membership?.productId || membership.status === 'none') return { ...base, state: 'none', isEntitled: false };

    if ((membership.validUntil ?? 0) > now) {
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
