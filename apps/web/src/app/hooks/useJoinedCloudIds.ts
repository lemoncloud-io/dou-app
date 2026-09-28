import { useMemo } from 'react';

import { RELAY_CLOUD_ID } from '@chatic/data';
import type { DomainCloud } from '@chatic/data';

/**
 * The ids of every cloud this account belongs to — the owned catalog and the invited-cloud cache,
 * owned first — without the relay. Stable across renders for the same membership, so it can key an
 * effect or a callback directly.
 *
 * Takes the two lists rather than reading them itself: every caller already holds them (each reads
 * `useCloudSessionCatalog` and `useInvitedClouds` for other reasons too), and this keeps the one
 * merge rule — dedupe, drop empty ids, drop relay — in one place instead of the four copies it
 * replaced. A caller that also wants the relay adds it itself.
 */
export const useJoinedCloudIds = (
    ownedClouds: readonly DomainCloud[],
    invitedClouds: readonly DomainCloud[]
): readonly string[] => {
    const ids = new Set<string>();
    for (const cloud of [...ownedClouds, ...invitedClouds]) {
        if (cloud.id && cloud.id !== RELAY_CLOUD_ID) ids.add(cloud.id);
    }
    // Keyed on the content: both inputs are fresh arrays on most renders.
    const key = [...ids].join('\n');
    return useMemo(() => (key ? key.split('\n') : []), [key]);
};
