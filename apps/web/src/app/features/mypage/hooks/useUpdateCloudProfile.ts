import { useMutation } from '@tanstack/react-query';

import { useRuntimeRepositories } from '@chatic/app-runtime';
import { useRefreshCurrentCloudSession } from '@chatic/web-core';

interface UpdateCloudProfileData {
    name?: string;
    photo?: string;
}

/**
 * Updates the current cloud-session user profile through the User domain socket
 * action ($backend.MyUserView), then re-issues the cloud token so the
 * session-derived cloud profile reflects the change. Replaces the former HTTP
 * `PUT /clouds/{cloudId}` flow on the cloud profile edit screen.
 */
export const useUpdateCloudProfile = () => {
    const { user } = useRuntimeRepositories();
    const { refreshCurrentCloudSession } = useRefreshCurrentCloudSession();

    return useMutation({
        mutationFn: async (data: UpdateCloudProfileData) => {
            await user.updateProfile(data as Parameters<typeof user.updateProfile>[0]);
            // Re-derive the session cloud profile from a fresh cloud token.
            await refreshCurrentCloudSession();
            return data;
        },
    });
};
