import { useCallback, useEffect, useRef } from 'react';
import { useIsMutating } from '@tanstack/react-query';

import { useRuntimeRepositories, useSocketState } from '@chatic/app-runtime';
import {
    SWITCH_CLOUD_MUTATION_KEY,
    SWITCH_SITE_MUTATION_KEY,
    useGlobalSession,
    useSessionSelection,
} from '@chatic/web-core';

// Periodic background-sync interval. The user-facing requirement is "about a minute"; lists
// only re-discover added/removed entries here, so a coarse cadence is intentional.
const BACKGROUND_SYNC_POLL_MS = 60_000;

/**
 * Global background sync — keeps place/channel/profile lists fresh regardless of route.
 * Ported from the testbed ChatHomePage `refreshActiveLists`, but lifted into the runtime
 * layer so polling continues outside the home page.
 *
 * Triggers:
 *  1. Rising edge of `isVerified` (false→true) — covers app entry, reconnect, and switch
 *     completion. A site/cloud switch commits a new identity token, which re-authenticates
 *     the socket (SocketAuthBinder), so the rising edge fires exactly when the new session
 *     is verified — never against the stale pre-switch session.
 *  2. Periodic timer while verified — skipped during an in-flight switch.
 *
 * Switch detection is global via `useIsMutating` on the switch mutation keys: the switch is
 * triggered by other components, whose per-hook `isSwitching`/`isPending` is invisible here.
 * This closes the optimistic window (old session still verified=true before markUnverified).
 */
export const useBackgroundSync = (): void => {
    const repos = useRuntimeRepositories();
    const session = useGlobalSession();
    const { selectedSiteId } = useSessionSelection();
    const { isVerified } = useSocketState();

    const cid = session.activeServer.kind === 'cloud' ? session.activeServer.cloudId : 'default';
    const activeSiteId = selectedSiteId;

    const isSwitching =
        useIsMutating({ mutationKey: SWITCH_SITE_MUTATION_KEY }) +
            useIsMutating({ mutationKey: SWITCH_CLOUD_MUTATION_KEY }) >
        0;

    // Place snapshot + channel/profile delta sync with watermarks. place.refreshList is a full
    // snapshot (no cursor); channel.syncChannels / profile.syncProfiles are delta APIs, so the
    // stored syncedAt is passed as `since` and the returned syncedAt is persisted back.
    const refreshActiveLists = useCallback(async () => {
        void repos.place.refreshList().catch(() => {
            /* best-effort */
        });

        void repos.channel.refreshList({}).catch(() => {
            /* best-effort */
        });

        // Channel delta sync — channel.sync spans the whole cloud, so the cursor is keyed by cid.
        // Each channel is stored tagged with its own sid, so this is correct across site switches.
        try {
            const channelSyncKind = `channel-sync:${cid}`;
            const since = await repos.syncMeta.getSyncedAt(channelSyncKind);
            const { syncedAt } = await repos.channel.syncChannels(since);
            await repos.syncMeta.setSyncedAt(channelSyncKind, syncedAt);
        } catch {
            // best-effort: on failure the watermark is not advanced → retried with the same since next tick
        }

        if (!activeSiteId) return;

        // Profile delta sync — cursor keyed by {cid, sid}. Passing since=0 every tick would
        // re-pull everything and lose removal deltas, so the watermark must advance.
        try {
            const profileSyncKind = `profile-sync:${cid}:${activeSiteId}`;
            const since = await repos.syncMeta.getSyncedAt(profileSyncKind);
            const { syncedAt } = await repos.profile.syncProfiles(since);
            await repos.syncMeta.setSyncedAt(profileSyncKind, syncedAt);
        } catch {
            // best-effort: on failure the watermark is not advanced → retried with the same since next tick
        }
    }, [repos.place, repos.channel, repos.profile, repos.syncMeta, cid, activeSiteId]);

    // Trigger 1 — rising edge of isVerified (app entry / reconnect / switch completion).
    const prevVerifiedRef = useRef(false);
    useEffect(() => {
        const becameVerified = !prevVerifiedRef.current && isVerified;
        prevVerifiedRef.current = isVerified;
        if (becameVerified) void refreshActiveLists();
    }, [isVerified, refreshActiveLists]);

    // Trigger 2 — periodic poll while verified, skipped during an in-flight switch (the optimistic
    // window can leave the old session briefly verified=true; the rising edge handles completion).
    useEffect(() => {
        if (!isVerified || isSwitching) return;
        const timer = setInterval(() => void refreshActiveLists(), BACKGROUND_SYNC_POLL_MS);
        return () => clearInterval(timer);
    }, [isVerified, isSwitching, refreshActiveLists]);
};
