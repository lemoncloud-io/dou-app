import { useClouds } from '../../../hooks/useCloudCatalog';

import type { CloudView } from '@lemoncloud/chatic-backend-api';

import { findUnboundClouds } from '../lib';

export interface UnboundClouds {
    /** Owned clouds still missing their email (see `findUnboundClouds`). */
    clouds: CloudView[];
    isLoading: boolean;
}

/** Backs `EmailRequiredBanner` — detection only, same shape as `useExcessClouds`. */
export const useUnboundClouds = (): UnboundClouds => {
    const { data: cloudsData, isLoading } = useClouds({ limit: -1 });

    return {
        clouds: isLoading ? [] : findUnboundClouds(cloudsData?.list ?? []),
        isLoading,
    };
};
