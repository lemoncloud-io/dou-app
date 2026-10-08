import type { CloudView } from '@lemoncloud/chatic-backend-api';

import { useCloudSessionCatalog } from '../../../hooks/useCloudCatalog';

export interface OwnedCloudLookup {
    /** The catalog row, or undefined while the catalog is pending or when the id is not mine. */
    cloud: CloudView | undefined;
    /** The catalog has answered, so a missing row means "not an owned cloud", not "not yet". */
    isResolved: boolean;
}

/**
 * One owned cloud by id, from the relay catalog.
 *
 * The catalog lists owned clouds only (`view: 'mine'`), so presence in it IS the ownership check —
 * the same signal `useActiveCloudOwnership` reads for the active cloud, applied to the cloud a
 * management URL names. A screen that finds no row once the catalog has resolved is looking at a
 * cloud the user does not own (or a stale link) and should leave.
 */
export const useOwnedCloud = (cloudId: string | undefined): OwnedCloudLookup => {
    const { clouds, hasCloudCatalog } = useCloudSessionCatalog();
    return {
        cloud: cloudId ? clouds.find(cloud => cloud.id === cloudId) : undefined,
        isResolved: hasCloudCatalog,
    };
};
