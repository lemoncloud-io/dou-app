import { useMutation } from '@tanstack/react-query';

import { useRuntimeRepositories } from '@chatic/app-runtime';

interface UpdateProfileData {
    name?: string;
    photo?: string;
}

/**
 * Updates the current-session user profile through the User domain socket action
 * ($backend.MyUserView, relay/cloud common). The write lands in the user cache, which every reader
 * observes (useSessionProfile / useMyUser), so the UI reflects the change reactively — no session
 * profile patch needed. Replaces the former HTTP `PUT /users/{uid}` relay profile update.
 */
export const useUpdateProfile = () => {
    const { user } = useRuntimeRepositories();

    return useMutation({
        mutationFn: async (data: UpdateProfileData) => {
            await user.updateProfile(data as Parameters<typeof user.updateProfile>[0]);
            return data;
        },
    });
};
