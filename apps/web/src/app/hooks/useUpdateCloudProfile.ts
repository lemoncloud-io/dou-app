import { useMutation } from '@tanstack/react-query';

import { runtime } from '@chatic/app-runtime';

interface UpdateCloudProfileData {
    /** Target cloud id — any owned cloud; it does not have to be the active one. */
    id: string;
    name: string;
}

/**
 * Updates the CLOUD ENTITY's own name through the Cloud domain socket action (`cloud.update`), which
 * the data layer sends to the relay whichever cloud is active.
 *
 * This edits the cloud itself (owner-only) — NOT the connected user's per-cloud profile, which the
 * former implementation did via `user.updateProfile`. The cloud model has no image field, so the
 * name is the only editable attribute. This is the ONLY cloud-rename path in this app: the
 * switcher's inline rename, and the home `useUpdateCloud` it used, are gone.
 */
export const useUpdateCloudProfile = () => {
    const { cloud } = runtime.data.useRuntimeRepositories();

    return useMutation({
        mutationFn: ({ id, name }: UpdateCloudProfileData) =>
            cloud.updateCloud({ id, name } as Parameters<typeof cloud.updateCloud>[0]),
    });
};
