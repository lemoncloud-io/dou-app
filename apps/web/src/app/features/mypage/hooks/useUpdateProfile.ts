import { useMutation } from '@tanstack/react-query';

import { useRuntimeRepositories } from '@chatic/app-runtime';
import { useSessionIdentity } from '@chatic/web-core';

// Direct path rather than the `hooks` barrel: this module only needs the retained-profile writer,
// and the barrel would drag every other app hook into the dependency graph.
import { patchMyRelayUser, type MyUser } from '../../../hooks/useMyUser';

interface UpdateProfileData {
    name?: string;
    photo?: string;
}

/**
 * Updates the current-session ACCOUNT profile through the User domain socket action
 * ($backend.MyUserView). The action is pinned to the relay slot in the composition root, so the
 * edit reaches the account profile from either slot — including while a cloud session is active.
 *
 * On the relay the write lands in the user cache and every reader observes it
 * (useRuntimeProfile / useMyUser). From a cloud that cache belongs to the cloud partition, so the
 * repository skips it and the result is published to the retained relay profile instead — the value
 * the account screens display while a cloud is active. Replaces the former HTTP `PUT /users/{uid}`.
 */
export const useUpdateProfile = () => {
    const { user } = useRuntimeRepositories();
    const { userId } = useSessionIdentity();

    return useMutation({
        mutationFn: async (data: UpdateProfileData) => {
            const updated = await user.updateProfile(data as Parameters<typeof user.updateProfile>[0]);
            // The sent fields first, then whatever the server echoed back — so the display reflects
            // the save even if the response view omits a field.
            if (userId) patchMyRelayUser(userId, { ...data, ...((updated ?? {}) as Partial<MyUser>) });
            return data;
        },
    });
};
