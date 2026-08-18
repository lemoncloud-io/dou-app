import { useMemo } from 'react';

import { isNative } from '@chatic/bridges';
import { useMembershipInfo, useProductPlans } from '@chatic/web-core';

import type { ProductView } from '@lemoncloud/chatic-backend-api';

import { findPlanById, selectSellablePlans, summarizeMembership, type StorePlatform } from '../lib';
import type { SubscriptionSummary } from '../lib';

export interface PlanCatalog {
    /** Running inside the native shell — the only context where IAP (and a real store price) exists. */
    isOnMobileApp: boolean;
    isIOS: boolean;
    /** Store platform for this build; `undefined` off-native. */
    platform: StorePlatform | undefined;
    /** Tier 1~5 for the current store, ascending by `sort`. Empty off-native. */
    sellablePlans: ProductView[];
    /** The plan behind the running subscription — resolved even if it was bought on the other store. */
    currentPlan: ProductView | undefined;
    /**
     * The plan a new purchase would REPLACE, which is `currentPlan` only while it is still paid for.
     * An expired subscription is replaced, not changed, so adjacency must not constrain it. Derived
     * here so the picker and the purchase path cannot disagree about what "current" means.
     */
    replaceablePlan: ProductView | undefined;
    /** The plan queued for the next renewal, resolved from `pendingProductId`. */
    pendingPlan: ProductView | undefined;
    /** Four-state view of the membership, entitlement included. */
    summary: SubscriptionSummary;
    isLoading: boolean;
}

/**
 * The single source for what we can sell and what the user is on.
 *
 * `GET /products/plans` is called WITHOUT `platform`. The server filters by platform when asked
 * (`listPlans`), but it always filters by stage either way, so one unfiltered call returns both
 * stores' tiers for this stage — and that second store is the point: a membership bought on iOS has
 * to resolve its `maxClouds` while the user is signed in on Android, which a platform-filtered list
 * cannot do. The sellable list is then narrowed here by `product.platform`, which the view carries
 * (`ProductTransformer.modelAsView`), so nothing from the other store reaches a screen.
 */
export const usePlanCatalog = (): PlanCatalog => {
    const isOnMobileApp = isNative();
    const isIOS = isOnMobileApp && typeof window !== 'undefined' && window.CHATIC_APP_PLATFORM?.toLowerCase() === 'ios';
    const platform: StorePlatform | undefined = isOnMobileApp ? (isIOS ? 'apple' : 'google') : undefined;

    const { data: plansData, isLoading: isPlansLoading } = useProductPlans({ limit: -1 });
    const { data: membership, isLoading: isMembershipLoading } = useMembershipInfo();

    const plans = plansData?.list ?? [];
    const currentPlan = findPlanById(plans, membership?.productId);
    const pendingPlan = findPlanById(plans, membership?.pendingProductId);

    // Sampling the clock in render would hand out a fresh `summary` on every pass; memoising keeps
    // the object stable and re-reads the time only when the inputs it describes actually change.
    const summary = useMemo(() => summarizeMembership(membership, currentPlan, Date.now()), [membership, currentPlan]);

    return {
        isOnMobileApp,
        isIOS,
        platform,
        sellablePlans: selectSellablePlans(plans, platform),
        currentPlan,
        replaceablePlan: summary.isEntitled ? currentPlan : undefined,
        pendingPlan,
        summary,
        isLoading: isPlansLoading || isMembershipLoading,
    };
};
