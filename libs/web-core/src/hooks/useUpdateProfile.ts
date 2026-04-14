import { useMutation } from '@tanstack/react-query';

import { updateProfile } from '../api';
import { useWebCoreStore } from '../stores/useWebCoreStore';

interface UpdateProfileData {
    name?: string;
    imageUrl?: string;
}

export const useUpdateProfile = () => {
    const profile = useWebCoreStore(s => s.profile);
    const setProfile = useWebCoreStore(s => s.setProfile);

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
                setProfile({
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
