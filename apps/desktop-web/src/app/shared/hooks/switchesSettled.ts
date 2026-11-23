import type { QueryClient } from '@tanstack/react-query';

import { runtime } from '@chatic/runtime';

export const switchesSettled = (queryClient: QueryClient): Promise<void> =>
    new Promise(resolve => {
        const running = () =>
            queryClient.isMutating({ mutationKey: runtime.session.SWITCH_SITE_MUTATION_KEY }) +
            queryClient.isMutating({ mutationKey: runtime.session.SWITCH_CLOUD_MUTATION_KEY });
        if (running() === 0) {
            resolve();
            return;
        }
        const unsubscribe = queryClient.getMutationCache().subscribe(() => {
            if (running() > 0) return;
            unsubscribe();
            resolve();
        });
    });

export const liveSelection = (): { cloudId: string | null; placeId: string | null } => {
    const { cloud } = runtime.session.getGlobalSessionContext();
    return { cloudId: cloud.cloudId, placeId: cloud.siteId };
};
