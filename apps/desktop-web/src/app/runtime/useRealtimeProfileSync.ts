import { useEffect } from 'react';

import { runtime } from '@chatic/app-runtime';

// Inbound socket frame the server pushes when a reachable member edits their place profile
// (nick / photo / active). It is a bare nudge: the payload is the changed profile, but the hook
// does not read it — the delta pull below is idempotent and already knows which site to ask for.
// (`channel.sync-site-profile` is a deprecated request name for the pull itself, never a pushed frame.)
const PROFILE_SYNC_TYPE = 'profile.sync';

/**
 * Realtime place-profile sync.
 *
 * v2's plan-based sync only PULLS profiles (the 60s background `syncProfiles` poll in
 * `useBackgroundSync`), so a peer's nick/photo edit would not surface until the next
 * poll — the "other user's profile doesn't change live / reverts on reload" bug that
 * v1 fixed in the engine. v2 dropped that realtime path (the SDK's profile plan re-pulls on this
 * broadcast only for profiles registered with it, and desktop-web registers none — nothing does
 * the place-wide delta pull), so we restore it here at the runtime layer:
 *
 *  - on the server's `profile.sync` broadcast → re-pull immediately (realtime), and
 *  - on window `focus` → catch up edits made by others while the window was backgrounded.
 *
 * Both re-pulls are idempotent and share the background-sync watermark
 * (`profile-sync:{cid}:{sid}`), so push / focus / 60s-poll coordinate via one cursor
 * instead of double-applying (this absorbs the former standalone `useSiteProfileSync`).
 */
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

        const offBroadcast = runtime.connection
            .getSocketManager()
            .onType(PROFILE_SYNC_TYPE, () => void pullProfileDelta());
        const onFocus = () => void pullProfileDelta();
        window.addEventListener('focus', onFocus);

        return () => {
            offBroadcast();
            window.removeEventListener('focus', onFocus);
        };
    }, [repos, cid, selectedSiteId]);
};
