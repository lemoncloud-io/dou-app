import { useClouds } from '../../../hooks/useCloudCatalog';

import type { CloudView } from '@lemoncloud/chatic-backend-api';

import { findExcessClouds } from '../lib';
import { useCloudQuota } from './useCloudQuota';

export interface ExcessClouds {
    /** Clouds sitting past the allowance — likely, not authoritative (see `findExcessClouds`). */
    excess: CloudView[];
    used: number;
    limit: number | null;
    isLoading: boolean;
}

/**
 * Detects clouds left over after a downgrade.
 *
 * Detection only: releasing a cloud is irreversible, so the app never initiates it — the user goes
 * through the existing account-management path. But detection without exposure would leave a
 * "paying for tier1 while using more" window that nobody can see, so the result is surfaced (see
 * `ExcessCloudBanner`).
 */
export const useExcessClouds = (): ExcessClouds => {
    const { limit, used, isLoading } = useCloudQuota();
    const { data: cloudsData } = useClouds({ limit: -1 });

    return {
        excess: isLoading ? [] : findExcessClouds(cloudsData?.list ?? [], limit),
        used,
        limit,
        isLoading,
    };
};
