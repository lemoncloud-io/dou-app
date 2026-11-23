import type { CloudView } from '@lemoncloud/chatic-backend-api';

import { useOwnedClouds } from './useOwnedClouds';

export interface OwnedCloudLookup {
    cloud: CloudView | undefined;
    isResolved: boolean;
}

export const useOwnedCloud = (cloudId: string | undefined): OwnedCloudLookup => {
    const { clouds, hasCloudCatalog } = useOwnedClouds();
    return {
        cloud: cloudId ? clouds.find(cloud => cloud.id === cloudId) : undefined,
        isResolved: hasCloudCatalog,
    };
};
