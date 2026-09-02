import { useCallback, useState } from 'react';

import { useRuntimeRepositories } from '@chatic/app-runtime';

import { useCloudSessionCatalog } from './useCloudCatalog';
import { useJoinedCloudsStore } from '../stores';

/**
 * Remove a cloud from the rail. Two paths, by cloud kind:
 * - invited (joined via invite, not broker-owned): forget it locally — drop the
 *   rail entry and its captured re-entry bundle. Rejoinable with a fresh invite.
 * - owned (broker-delegable): delete it on the backend (cascade), then refresh
 *   the broker list so the rail drops it.
 */
export const useRemoveCloud = () => {
    const removeJoinedCloud = useJoinedCloudsStore(s => s.removeJoinedCloud);
    const { cloud: cloudRepository } = useRuntimeRepositories();
    const { refetchClouds } = useCloudSessionCatalog();
    const [isDeleting, setIsDeleting] = useState(false);

    const removeInvitedCloud = useCallback(
        (cloudId: string) => {
            removeJoinedCloud(cloudId);
            // Forget the invited cloud's local cache row (the v2 equivalent of the old
            // captured re-entry bundle) so it stops surfacing in the rail.
            void cloudRepository.cacheDelete(cloudId).catch(() => undefined);
        },
        [removeJoinedCloud, cloudRepository]
    );

    const deleteOwnedCloud = useCallback(
        async (cloudId: string) => {
            setIsDeleting(true);
            try {
                await cloudRepository.releaseCloud(cloudId, { cascade: true });
                void cloudRepository.cacheDelete(cloudId).catch(() => undefined);
                await refetchClouds();
            } finally {
                setIsDeleting(false);
            }
        },
        [refetchClouds, cloudRepository]
    );

    return { removeInvitedCloud, deleteOwnedCloud, isDeleting };
};
