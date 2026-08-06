import { useRuntimeProfile } from '@chatic/app-runtime';
import { useCloudSessionCatalog, useSessionSelection } from '@chatic/web-core';

import type { CloudView } from '@lemoncloud/chatic-backend-api';

export interface ActiveCloudOwnership {
    /** The owned cloud currently active, or undefined when the active cloud is not one I own. */
    activeCloud?: CloudView;
    /** A non-default cloud is selected AND its session is live — the precondition for any cloud edit. */
    isCloudSessionReady: boolean;
    /** The active cloud is a live cloud session I own. */
    isOwner: boolean;
    /** The relay catalog is still resolving, so ownership is not decidable yet. */
    isPending: boolean;
}

/**
 * Whether the ACTIVE cloud is a live session on a cloud the user OWNS.
 *
 * The relay catalog lists owned clouds only (`view: 'mine'`), so membership in it IS the ownership
 * signal — an invited cloud is never in it. Shared rather than re-derived per screen so the entry
 * point and the owner-only screen behind it cannot disagree: when they drift, the menu row shows for
 * a non-owner and the screen bounces them straight back out.
 *
 * `isPending` matters to a screen that redirects on `!isOwner` — judging ownership while the catalog
 * is in flight would throw a legitimate owner out. An entry point can ignore it and simply stay
 * hidden until the catalog resolves.
 */
export const useActiveCloudOwnership = (): ActiveCloudOwnership => {
    const { selectedCloudId } = useSessionSelection();
    const { isCloudActive } = useRuntimeProfile();
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
