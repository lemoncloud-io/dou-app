import { useCallback, useState } from 'react';

import { runtime } from '@chatic/runtime-react';

import { useCloudSessionCatalog } from './useCloudCatalog';
import { useJoinedCloudsStore } from '../stores';
import { classifyWireError, extractErrorMessage } from '../utils';

export const isCloudAlreadyGone = (error: unknown): boolean => {
    const text = extractErrorMessage(error);
    const kind = classifyWireError(text);
    if (kind === 'notFound') return /not found cloud/i.test(text);
    return kind === 'expired' && /\b409\b|CONFLICT/i.test(text);
};

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

export type DeleteOwnedCloudResult = 'deleted' | 'already-gone';

export const useRemoveCloud = () => {
    const removeJoinedCloud = useJoinedCloudsStore(s => s.removeJoinedCloud);
    const { cloud: cloudRepository } = runtime.data.useRuntimeRepositories();
    const { refetchClouds } = useCloudSessionCatalog();
    const [isDeleting, setIsDeleting] = useState(false);

    const removeInvitedCloud = useCallback(
        (cloudId: string) => {
            removeJoinedCloud(cloudId);
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
