import { useClouds } from '../../../hooks/useCloudCatalog';
import { useMembershipInfo } from '../../../hooks/useMembership';

import { countOwnedClouds, evaluateCloudQuota, type CloudQuotaReason } from '../lib';
import { usePlanCatalog } from './usePlanCatalog';

export interface CloudQuota {
    used: number;
    limit: number | null;
    canAdd: boolean;
    reason?: CloudQuotaReason;
    isLoading: boolean;
    isFetching: boolean;
}

export const useCloudQuota = (): CloudQuota => {
    const { summary, isLoading: isCatalogLoading, currentPlan } = usePlanCatalog();
    const { data: cloudsData, isLoading: isCloudsLoading, isFetching: isCloudsFetching } = useClouds({ limit: -1 });
    const { data: membership, isFetching: isMembershipFetching } = useMembershipInfo();

    const isLoading = isCatalogLoading || isCloudsLoading;
    const used = countOwnedClouds(cloudsData?.list ?? []);
    const limit = currentPlan?.maxClouds ?? null;

    const verdict = evaluateCloudQuota({ used, limit, state: summary.state, isValid: membership?.isValid });

    return {
        used,
        limit,
        canAdd: !isLoading && verdict.canAdd,
        reason: isLoading ? undefined : verdict.reason,
        isLoading,
        isFetching: isCloudsFetching || isMembershipFetching,
    };
};
