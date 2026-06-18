import { useMutation } from '@tanstack/react-query';

import { updateProfile } from '../api';
import { setSessionProfile, useSessionAuth } from '../session';

interface UpdateProfileData {
    name?: string;
    photo?: string;
}

export const useUpdateProfile = () => {
    const { profile } = useSessionAuth();

    return useMutation({
        mutationFn: async (data: UpdateProfileData) => {
            if (!profile?.uid) {
                throw new Error('No user ID available');
            }

            return await updateProfile(profile.uid, data as Record<string, unknown>);
        },
        onSuccess: updated => {
            // Merge with existing profile to preserve other fields
            if (updated && profile) {
                setSessionProfile({
                    ...profile,
                    $user: {
                        ...profile.$user,
                        ...updated,
                    },
                });
            }
        },
    });
};
