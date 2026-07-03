import { useRuntimeRepositories } from '@chatic/app-runtime';
import { useGlobalSession, useRefreshCloudSiteSession } from '@chatic/web-core';
import type { DataRepositoriesV2 } from '@chatic/data';

import { updateUserProfile, type UpdateUserProfilePayload } from './updateUserProfile';

/**
 * Binds updateUserProfile to the active server: user.updateProfile runs under the live socket
 * request context, then the active server's site session is re-issued so the session-derived
 * identity picks up the change. Returns a callback the UI awaits.
 */
export const useUpdateUserProfile = () => {
    const repos = useRuntimeRepositories() as unknown as DataRepositoriesV2;
    const { activeServer } = useGlobalSession();
    const { refreshSiteSession } = useRefreshCloudSiteSession();

    return (payload: UpdateUserProfilePayload) =>
        updateUserProfile(
            p => repos.user.updateProfile(p as Parameters<typeof repos.user.updateProfile>[0]),
            async () => {
                const sid = activeServer.siteId;
                if (sid) await refreshSiteSession(sid);
            },
            payload
        );
};
