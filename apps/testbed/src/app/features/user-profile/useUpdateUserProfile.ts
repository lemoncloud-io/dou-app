import { useRuntimeRepositories } from '@chatic/app-runtime';
import type { DataRepositoriesV2 } from '@chatic/data';

import { updateUserProfile, type UpdateUserProfilePayload } from './updateUserProfile';

/**
 * Binds updateUserProfile to the active server: user.updateProfile runs under the live socket
 * request context and writes the user cache, which is what `useRuntimeProfile` renders from.
 * Returns a callback the UI awaits.
 */
export const useUpdateUserProfile = () => {
    const repos = useRuntimeRepositories() as unknown as DataRepositoriesV2;

    return (payload: UpdateUserProfilePayload) =>
        updateUserProfile(p => repos.user.updateProfile(p as Parameters<typeof repos.user.updateProfile>[0]), payload);
};
