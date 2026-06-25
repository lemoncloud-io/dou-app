import { useCallback, useState } from 'react';
import { logger } from '@chatic/bridges';
import { useRuntimeRepositories } from '@chatic/app-runtime';
import type { DomainCloud } from '@chatic/data';

export const useInviteMutations = () => {
    // Invited clouds are persisted into the unified cloud cache (DomainCloud, cloudType 'invited').
    const { cloud } = useRuntimeRepositories();

    const [isSaving, setIsSaving] = useState(false);

    /**
     * Persist an invited cloud into the local cache so it shows up in the cloud list.
     */
    const saveInvite = useCallback(
        async (inviteData: DomainCloud) => {
            setIsSaving(true);

            try {
                await cloud.cacheWrite(inviteData);
            } catch (error) {
                logger.error('INVITE', 'Failed to save invite', { error, data: { inviteId: inviteData.id } });
                throw error;
            } finally {
                setIsSaving(false);
            }
        },
        [cloud]
    );

    return {
        saveInvite,
        isSaving,
    };
};
