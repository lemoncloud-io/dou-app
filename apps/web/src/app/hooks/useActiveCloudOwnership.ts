import { runtime } from '@chatic/runtime';
import { useCloudSessionCatalog } from './useCloudCatalog';

import type { CloudView } from '@lemoncloud/chatic-backend-api';

export interface ActiveCloudOwnership {
    activeCloud?: CloudView;
    isCloudSessionReady: boolean;
    isOwner: boolean;
    isPending: boolean;
}

export const useActiveCloudOwnership = (): ActiveCloudOwnership => {
    const { selectedCloudId } = runtime.session.useSessionSelection();
    const { isCloudActive } = runtime.session.useRuntimeProfile();
    const { clouds, isPendingClouds } = useCloudSessionCatalog();

    const isDefaultCloud = !selectedCloudId || selectedCloudId === 'default';
    const isCloudSessionReady = !isDefaultCloud && isCloudActive;
    const activeCloud = isCloudSessionReady ? clouds.find(cloud => cloud.id === selectedCloudId) : undefined;

    return {
        activeCloud,
        isCloudSessionReady,
        isOwner: isCloudSessionReady && !!activeCloud,
        isPending: isPendingClouds,
    };
};
