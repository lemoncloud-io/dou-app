import { useMutation } from '@tanstack/react-query';

import { patchRelayProfile, updateSessionProfile } from '../../session';
import { useSessionIdentity } from '../session/readers/useSessionIdentity';

interface UpdateProfileData {
    name?: string;
    photo?: string;
}

/**
 * Updates the relay profile and reapplies the local relay profile snapshot on success.
 */
export const useUpdateProfile = () => {
    const { relayProfile } = useSessionIdentity();

    return useMutation({
        mutationFn: async (data: UpdateProfileData) => {
            if (!relayProfile?.uid) {
                throw new Error('No user ID available');
            }

            await updateSessionProfile(relayProfile.uid, data as Record<string, unknown>);
            return data;
        },
        onSuccess: updated => {
            patchRelayProfile(updated as Record<string, unknown>);
        },
    });
};
