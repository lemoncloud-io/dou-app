import { useMutation } from '@tanstack/react-query';

import { useRuntimeRepositories } from '@chatic/app-runtime';

interface UpdateCloudProfileData {
    /** Target cloud id (the active/selected cloud). */
    id: string;
    name: string;
}

/**
 * Updates the CLOUD ENTITY's own name through the Cloud domain socket action (`cloud.update`).
 *
 * This edits the cloud itself (owner-only) — NOT the connected user's per-cloud profile, which the
 * former implementation did via `user.updateProfile`. The cloud model has no image field, so the
 * name is the only editable attribute. This is now the ONLY cloud-rename path: the switcher's
 * inline rename (and the home `useUpdateCloud` it used) were removed in ADR-0034.
 */
export const useUpdateCloudProfile = () => {
    const { cloud } = useRuntimeRepositories();

    return useMutation({
        mutationFn: ({ id, name }: UpdateCloudProfileData) =>
            cloud.updateCloud({ id, name } as Parameters<typeof cloud.updateCloud>[0]),
    });
};
