import type { QueryClient } from '@tanstack/react-query';

import { runtime } from '@chatic/app-runtime';

// A write the server files under the session's place (a 1:1, a channel) waits on these: during a
// place or cloud switch the selection already names the new place while the session is still in the
// one being left.

/**
 * Resolves once no place or cloud switch is running. Read from the mutation cache rather than a
 * render, so a caller that unmounts mid-wait (a dialog closing on its own click) still sends once it
 * settles.
 */
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

/**
 * The selected cloud and place as the session holds them right now. Read live, not from a render: a
 * failed switch rolls the place back inside its own mutation, and the wait above can resolve before
 * React has rendered the rollback.
 */
export const liveSelection = (): { cloudId: string | null; placeId: string | null } => {
    const { cloud } = runtime.session.getGlobalSessionContext();
    return { cloudId: cloud.cloudId, placeId: cloud.siteId };
};
