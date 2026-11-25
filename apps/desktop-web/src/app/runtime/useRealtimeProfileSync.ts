import { useEffect } from 'react';

import { runtime } from '@chatic/runtime-react';

const PROFILE_SYNC_TYPE = 'profile.sync';

export const useRealtimeProfileSync = (): void => {
    const repos = runtime.data.useRuntimeRepositories();
    const session = runtime.session.useGlobalSession();
    const { selectedSiteId } = runtime.session.useSessionSelection();

    const cid = session.activeServer.kind === 'cloud' ? session.activeServer.cloudId : 'default';

    useEffect(() => {
        if (!selectedSiteId) return;

        const pullProfileDelta = async () => {
            try {
                const key = `profile-sync:${cid}:${selectedSiteId}`;
                const since = await repos.syncMeta.getSyncedAt(key);
                const { syncedAt } = await repos.profile.syncProfiles(since, selectedSiteId);
                await repos.syncMeta.setSyncedAt(key, syncedAt);
            } catch {
                // best-effort: the 60s background poll catches up if this pull fails
            }
        };

        const offBroadcast = runtime.connection.onServerEvent(PROFILE_SYNC_TYPE, () => void pullProfileDelta());
        const onFocus = () => void pullProfileDelta();
        window.addEventListener('focus', onFocus);

        return () => {
            offBroadcast();
            window.removeEventListener('focus', onFocus);
        };
    }, [repos, cid, selectedSiteId]);
};
