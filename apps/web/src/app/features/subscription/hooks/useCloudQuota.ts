import { useClouds } from '@chatic/web-core';

import { countOwnedClouds, evaluateCloudQuota, type CloudQuotaReason } from '../lib';
import { usePlanCatalog } from './usePlanCatalog';

export interface CloudQuota {
    /** Clouds currently owned (released ones excluded). */
    used: number;
    /** The plan's allowance, or `null` when the app cannot resolve it. */
    limit: number | null;
    canAdd: boolean;
    /** Why not, when `canAdd` is false. Absent while still loading. */
    reason?: CloudQuotaReason;
    isLoading: boolean;
}

/**
 * The one place that decides whether another cloud may be added.
 *
 * Every "＋ 클라우드 추가" affordance goes through this — the rule used to be inlined as
 * `MAX_CLOUDS = 1` in the home flow and `clouds.length >= 1` on the plans page, and two copies of a
 * rule is a rule waiting to drift. The allowance comes from the plan catalog, never from
 * `membership.product$` (which is a head and has no `maxClouds`).
 */
export const useCloudQuota = (): CloudQuota => {
    const { summary, isLoading: isCatalogLoading, currentPlan } = usePlanCatalog();
    const { data: cloudsData, isLoading: isCloudsLoading } = useClouds({ limit: -1 });

    const isLoading = isCatalogLoading || isCloudsLoading;
    const used = countOwnedClouds(cloudsData?.list ?? []);
    // `currentPlan` is already the catalog join against the FULL plan list, so there is no second
    // place to look: `null` here means the app genuinely cannot resolve the allowance.
    const limit = currentPlan?.maxClouds ?? null;

    const verdict = evaluateCloudQuota({ used, limit, state: summary.state });

    return {
        used,
        limit,
        canAdd: !isLoading && verdict.canAdd,
        // Suppress the reason until the inputs have landed: "구독이 필요해요" on a half-loaded
        // membership is worse than saying nothing for a moment.
        reason: isLoading ? undefined : verdict.reason,
        isLoading,
    };
};
