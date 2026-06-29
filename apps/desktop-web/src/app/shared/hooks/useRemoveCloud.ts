import { useCallback } from 'react';

import { useCloudSessionCatalog } from '@chatic/web-core';
import { useRuntimeRepositories } from '@chatic/app-runtime';
import { useDeleteCloud } from '@chatic/subscriptions';

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
    const { mutateAsync: deleteCloudMutation, isPending: isDeleting } = useDeleteCloud();

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
            await deleteCloudMutation({ id: cloudId, params: { cascade: 1 } });
            void cloudRepository.cacheDelete(cloudId).catch(() => undefined);
            await refetchClouds();
        },
        [deleteCloudMutation, refetchClouds, cloudRepository]
    );

    return { removeInvitedCloud, deleteOwnedCloud, isDeleting };
};
