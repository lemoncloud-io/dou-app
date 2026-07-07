import { useEffect } from 'react';

import { getSocketManager, useRuntimeRepositories } from '@chatic/app-runtime';
import { useGlobalSession, useSessionSelection } from '@chatic/web-core';

// Inbound socket message pushed by the server when a reachable member edits their
// place profile (nick / photo). Same channel-domain broadcast the v1 engine consumed
// via ProfileRepository's `profile:sync` listener (commit f9d4186c).
const SYNC_SITE_PROFILE_TYPE = 'channel.sync-site-profile';

/**
 * Realtime place-profile sync.
 *
 * v2's plan-based sync only PULLS profiles (the 60s background `syncProfiles` poll in
 * `useBackgroundSync`), so a peer's nick/photo edit would not surface until the next
 * poll — the "other user's profile doesn't change live / reverts on reload" bug that
 * v1 fixed in the engine. v2 dropped that realtime path (no plan consumes the
 * `channel.sync-site-profile` broadcast), so we restore it here at the runtime layer:
 *
 *  - on the server's `sync-site-profile` broadcast → re-pull immediately (realtime), and
 *  - on window `focus` → catch up edits made by others while the window was backgrounded.
 *
 * Both re-pulls are idempotent and share the background-sync watermark
 * (`profile-sync:{cid}:{sid}`), so push / focus / 60s-poll coordinate via one cursor
 * instead of double-applying (this absorbs the former standalone `useSiteProfileSync`).
 */
export const useRealtimeProfileSync = (): void => {
    const repos = useRuntimeRepositories();
    const session = useGlobalSession();
    const { selectedSiteId } = useSessionSelection();

    const cid = session.activeServer.kind === 'cloud' ? session.activeServer.cloudId : 'default';

    useEffect(() => {
        if (!selectedSiteId) return;

        const pullProfileDelta = async () => {
            try {
                const key = `profile-sync:${cid}:${selectedSiteId}`;
                const since = await repos.syncMeta.getSyncedAt(key);
                const { syncedAt } = await repos.profile.syncProfiles(since);
                await repos.syncMeta.setSyncedAt(key, syncedAt);
            } catch {
                // best-effort: the 60s background poll catches up if this pull fails
            }
        };

        const offBroadcast = getSocketManager().onType(SYNC_SITE_PROFILE_TYPE, () => void pullProfileDelta());
        const onFocus = () => void pullProfileDelta();
        window.addEventListener('focus', onFocus);

        return () => {
            offBroadcast();
            window.removeEventListener('focus', onFocus);
        };
    }, [repos, cid, selectedSiteId]);
};
