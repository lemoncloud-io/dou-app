import { useCallback } from 'react';

import { cloudCore } from '@chatic/web-core';
import { useCloudSession } from '@chatic/app-runtime';
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
    const { refetchClouds } = useCloudSession();
    const { mutateAsync: deleteCloudMutation, isPending: isDeleting } = useDeleteCloud();

    const removeInvitedCloud = useCallback(
        (cloudId: string) => {
            removeJoinedCloud(cloudId);
            cloudCore.clearInvitedCloud(cloudId);
        },
        [removeJoinedCloud]
    );

    const deleteOwnedCloud = useCallback(
        async (cloudId: string) => {
            await deleteCloudMutation({ id: cloudId, params: { cascade: 1 } });
            cloudCore.clearInvitedCloud(cloudId);
            await refetchClouds();
        },
        [deleteCloudMutation, refetchClouds]
    );

    return { removeInvitedCloud, deleteOwnedCloud, isDeleting };
};
