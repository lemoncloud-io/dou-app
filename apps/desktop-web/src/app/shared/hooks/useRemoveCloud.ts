import { useCallback, useState } from 'react';

import { runtime } from '@chatic/app-runtime';

import { useCloudSessionCatalog } from './useCloudCatalog';
import { useJoinedCloudsStore } from '../stores';
import { classifyWireError, extractErrorMessage } from '../utils';

/**
 * A release the backend refuses because the cloud is already expired (`409 CONFLICT - already
 * expired`) or not there (`404`). A retry can only fail the same way: the rail's list was out of
 * date, and the cloud is as deleted as it is going to be. A bare "expired" is not enough: an expired
 * token reads the same to `classifyWireError`, and that is a failure to report.
 */
export const isCloudAlreadyGone = (error: unknown): boolean => {
    const text = extractErrorMessage(error);
    const kind = classifyWireError(text);
    // A 404 from a route that is not there reads as `notFound` too; the backend's 404 names the cloud.
    if (kind === 'notFound') return /not found cloud/i.test(text);
    return kind === 'expired' && /\b409\b|CONFLICT/i.test(text);
};

/**
 * Why a delete was refused, in words. Kept apart from `switchCauseKey`: there an expired cloud
 * reads as lost access, which is the wrong thing to tell someone who is deleting it.
 */
export const deleteCauseKey = (error: unknown): string => {
    switch (classifyWireError(extractErrorMessage(error))) {
        case 'denied':
            return 'cloud.deleteCause.denied';
        case 'network':
            return 'cloud.deleteCause.network';
        default:
            return 'cloud.deleteCause.other';
    }
};

/** `already-gone`: the cloud was released before this delete; the list has been refreshed to say so. */
export type DeleteOwnedCloudResult = 'deleted' | 'already-gone';

/**
 * Remove a cloud from the rail. Two paths, by cloud kind:
 * - invited (joined via invite, not broker-owned): forget it locally — drop the
 *   rail entry and its captured re-entry bundle. Rejoinable with a fresh invite.
 * - owned (broker-delegable): delete it on the backend (cascade), then refresh
 *   the broker list so the rail drops it. A refusal throws, for the caller to word; a cloud that was
 *   already released is not a failure (`isCloudAlreadyGone`).
 */
export const useRemoveCloud = () => {
    const removeJoinedCloud = useJoinedCloudsStore(s => s.removeJoinedCloud);
    const { cloud: cloudRepository } = runtime.data.useRuntimeRepositories();
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
        async (cloudId: string): Promise<DeleteOwnedCloudResult> => {
            setIsDeleting(true);
            try {
                let result: DeleteOwnedCloudResult = 'deleted';
                try {
                    await cloudRepository.releaseCloud(cloudId, { cascade: true });
                } catch (error) {
                    if (!isCloudAlreadyGone(error)) throw error;
                    result = 'already-gone';
                }
                void cloudRepository.cacheDelete(cloudId).catch(() => undefined);
                await refetchClouds();
                return result;
            } finally {
                setIsDeleting(false);
            }
        },
        [refetchClouds, cloudRepository]
    );

    return { removeInvitedCloud, deleteOwnedCloud, isDeleting };
};
