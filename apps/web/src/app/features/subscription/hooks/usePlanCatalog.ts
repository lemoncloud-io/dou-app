import { useMemo } from 'react';

import { isNative } from '@chatic/bridges';
import { useMembershipInfo, useProductPlans } from '../../../hooks/useMembership';

import type { ProductView } from '@lemoncloud/chatic-backend-api';

import {
    findPlanById,
    findResubscribePlan,
    isHeldByWeb,
    selectSellablePlans,
    summarizeMembership,
    webPlanPlatform,
    type StorePlatform,
} from '../lib';
import type { SubscriptionSummary } from '../lib';

export interface PlanCatalog {
    /** Running inside the native shell — the only context where IAP (and a real store price) exists. */
    isOnMobileApp: boolean;
    isIOS: boolean;
    /** Store platform for this build; `undefined` off-native. */
    platform: StorePlatform | undefined;
    /** Tier 1~5 for the current store, ascending by `sort`. Empty off-native. */
    sellablePlans: ProductView[];
    /**
     * Both stores' tiers, unfiltered — and, for a membership the website bills, its provider's tiers
     * too. For questions about the catalog itself, not about selling.
     */
    catalogPlans: ProductView[];
    /** The plan behind the running subscription — resolved even if it was bought on the other store. */
    currentPlan: ProductView | undefined;
    /**
     * The plan a new purchase would REPLACE, which is `currentPlan` only while it is still paid for.
     * An expired subscription is replaced, not changed, so adjacency must not constrain it. Derived
     * here so the picker and the purchase path cannot disagree about what "current" means.
     */
    replaceablePlan: ProductView | undefined;
    /**
     * After an expiry, this store's tier at the rank the lapsed receipt held — the plan the picker
     * offers back in place of the entry tier (`findResubscribePlan`). `undefined` in every other state.
     */
    resubscribePlan: ProductView | undefined;
    /**
     * The running subscription is billed by the other store (bought on Android, opened on iOS, or
     * the reverse). Nothing about it can be changed or managed from here — see `isOtherStorePlan`.
     */
    isOtherStore: boolean;
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
 *
 * The website's products are the exception: the relay lists them only to a call that names their
 * provider. A membership the website bills therefore reads that provider's list too, and its plan,
 * pending plan, allowance and trial resolve from it like a store's.
 */
export const usePlanCatalog = (): PlanCatalog => {
    const isOnMobileApp = isNative();
    const isIOS = isOnMobileApp && typeof window !== 'undefined' && window.CHATIC_APP_PLATFORM?.toLowerCase() === 'ios';
    const platform: StorePlatform | undefined = isOnMobileApp ? (isIOS ? 'apple' : 'google') : undefined;

    const { data: plansData, isLoading: isPlansLoading } = useProductPlans({ limit: -1 });
    const { data: membership, isLoading: isMembershipLoading } = useMembershipInfo();
    // The unfiltered list holds the stores' tiers only, so a membership the website bills reads its
    // plan from its own provider's list as well. Anyone else makes no second call.
    const webPlatform = webPlanPlatform(membership?.platform);
    const { data: webPlansData, isLoading: isWebPlansLoading } = useProductPlans(
        { limit: -1, platform: webPlatform },
        { enabled: !!webPlatform }
    );

    // Everything the membership may name. The stores' tiers stay the only ones sold here: the
    // sellable list keeps this build's store alone (`selectSellablePlans`).
    const plans = useMemo(
        () => [...(plansData?.list ?? []), ...(webPlatform ? (webPlansData?.list ?? []) : [])],
        [plansData, webPlansData, webPlatform]
    );
    // Trial length is a property of what was actually bought, so it is read off the receipt's plan.
    // An admin grant never carries a trial.
    const receiptPlan = findPlanById(plans, membership?.productId);
    const pendingPlan = findPlanById(plans, membership?.pendingProductId);

    // Sampling the clock in render would hand out a fresh `summary` on every pass; memoising keeps
    // the object stable and re-reads the time only when the inputs it describes actually change.
    const summary = useMemo(() => summarizeMembership(membership, receiptPlan, Date.now()), [membership, receiptPlan]);

    // The quota follows the grade in force, which an active admin override can raise above the
    // receipt's (ADR-0101). `summary.productId` already resolves that; the receipt's plan is the
    // fallback for a granted product the catalog does not list.
    const currentPlan = findPlanById(plans, summary.productId) ?? receiptPlan;
    const replaceablePlan = summary.hasLiveReceipt ? receiptPlan : undefined;
    const sellablePlans = selectSellablePlans(plans, platform);
    // The server keeps `productId` through an expiry, so the lapsed tier is still known here. A
    // blocked or granted membership is not "expired" and does not get it — only a lapsed receipt.
    const resubscribePlan = summary.state === 'expired' ? findResubscribePlan(receiptPlan, sellablePlans) : undefined;

    return {
        isOnMobileApp,
        isIOS,
        platform,
        sellablePlans,
        catalogPlans: plans,
        currentPlan,
        // What a tier change would replace AT THE STORE — so it follows the receipt, never an
        // admin grant. Gating this on `isEntitled` was right until overrides existed and is wrong
        // in both directions now: a grant would name a plan the user never bought as Google's
        // `oldPlanId`, and a block would offer a fresh purchase over a live store subscription.
        replaceablePlan,
        resubscribePlan,
        // The website counts as another store here whether or not the catalog lists its plan, which
        // the first test needs and the second does not.
        isOtherStore:
            !!platform &&
            ((!!replaceablePlan?.platform && replaceablePlan.platform !== platform) ||
                isHeldByWeb(summary, membership?.platform)),
        pendingPlan,
        summary,
        isLoading: isPlansLoading || isMembershipLoading || isWebPlansLoading,
    };
};
