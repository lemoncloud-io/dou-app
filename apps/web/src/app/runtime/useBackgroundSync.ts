import { useCallback, useEffect, useRef } from 'react';
import { useIsMutating } from '@tanstack/react-query';

import { useRuntimeRepositories, useSocketState } from '@chatic/app-runtime';
import {
    SWITCH_CLOUD_MUTATION_KEY,
    SWITCH_SITE_MUTATION_KEY,
    useGlobalSession,
    useSessionSelection,
} from '@chatic/web-core';

import { useAppForeground } from '../bridge';

// Periodic background-sync interval. The user-facing requirement is "about a minute"; lists
// only re-discover added/removed entries here, so a coarse cadence is intentional.
const BACKGROUND_SYNC_POLL_MS = 60_000;

// channel.mine snapshot size, mirroring desktop-web useChannels. `detail: true` is required
// so the snapshot carries lastChat$ and the mapper can derive lastActivityAt.
const CHANNEL_SNAPSHOT_LIMIT = 100;

/**
 * Global background sync — keeps place/channel/profile lists fresh regardless of route.
 * Ported from the testbed ChatHomePage `refreshActiveLists`, but lifted into the runtime
 * layer so polling continues outside the home page.
 *
 * Triggers:
 *  1. Rising edge of `isVerified` (false→true) — covers app entry, reconnect, and switch
 *     completion. A site/cloud switch commits a new identity token, which the SDK AuthController
 *     re-authenticates (auth.switch / reconnect re-auth), so the rising edge fires exactly when
 *     the new session is verified — never against the stale pre-switch session.
 *  2. Periodic timer while verified — skipped during an in-flight switch.
 *
 * Switch detection is global via `useIsMutating` on the switch mutation keys: the switch is
 * triggered by other components, whose per-hook `isSwitching`/`isPending` is invisible here.
 * This closes the optimistic window (old session still verified=true before the new handshake).
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
        // These are three INDEPENDENT socket domains (user profile, channel delta, profile delta) plus
        // the fire-and-forget place snapshot — they share no data dependency, so run them concurrently.
        // Awaiting them serially cost ~3 sequential socket round trips on every switch / 60s poll /
        // foreground; Promise.all collapses that to one round-trip depth. Each block keeps its own
        // getSyncedAt → sync → setSyncedAt watermark ordering internally.
        void repos.place.refreshList().catch(() => {
            /* best-effort */
        });

        await Promise.all([
            // Refresh the current-session user profile (User domain); the repository caches the embedded
            // $site into the place store. Keeps the account profile + active site fresh.
            repos.user.getMyProfile().catch(() => {
                // best-effort: a failed profile refresh leaves the previous cache intact
            }),

            // Channel delta sync — channel.sync spans the whole cloud, so the cursor is keyed by cid.
            // Each channel is stored tagged with its own sid, so this is correct across site switches.
            (async () => {
                try {
                    const channelSyncKind = `channel-sync:${cid}`;
                    const since = await repos.syncMeta.getSyncedAt(channelSyncKind);
                    const { syncedAt } = await repos.channel.syncChannels(since);
                    await repos.syncMeta.setSyncedAt(channelSyncKind, syncedAt);
                } catch {
                    // best-effort: watermark not advanced → retried with the same since next tick
                }
            })(),

            // Profile delta sync — cursor keyed by {cid, sid}. Passing since=0 every tick would re-pull
            // everything and lose removal deltas, so the watermark must advance. Skipped without a site.
            (async () => {
                if (!activeSiteId) return;
                try {
                    const profileSyncKind = `profile-sync:${cid}:${activeSiteId}`;
                    const since = await repos.syncMeta.getSyncedAt(profileSyncKind);
                    const { syncedAt } = await repos.profile.syncProfiles(since);
                    await repos.syncMeta.setSyncedAt(profileSyncKind, syncedAt);
                } catch {
                    // best-effort: watermark not advanced → retried with the same since next tick
                }
            })(),
        ]);
    }, [repos.place, repos.user, repos.channel, repos.profile, repos.syncMeta, cid, activeSiteId]);

    // Full channel snapshot (channel.mine) for the active site. Delta sync above only carries
    // changed rows, so the snapshot re-anchors the visible list. Runs on the rising edge only —
    // site/cloud switches re-authenticate the socket, so every context change hits this path
    // without paying a full fetch on each 60s tick.
    const refreshChannelSnapshot = useCallback(async () => {
        if (!activeSiteId) return;
        try {
            await repos.channel.refreshList({ sid: activeSiteId, detail: true, limit: CHANNEL_SNAPSHOT_LIMIT });
        } catch {
            // best-effort: the delta sync keeps the list converging until the next rising edge
        }
    }, [repos.channel, activeSiteId]);

    // Trigger 1 — rising edge of isVerified (app entry / reconnect / switch completion).
    const prevVerifiedRef = useRef(false);
    useEffect(() => {
        const becameVerified = !prevVerifiedRef.current && isVerified;
        prevVerifiedRef.current = isVerified;
        if (becameVerified) {
            void refreshActiveLists();
            void refreshChannelSnapshot();
        }
    }, [isVerified, refreshActiveLists, refreshChannelSnapshot]);

    // Trigger 2 — periodic poll while verified, skipped during an in-flight switch (the optimistic
    // window can leave the old session briefly verified=true; the rising edge handles completion).
    useEffect(() => {
        if (!isVerified || isSwitching) return;
        const timer = setInterval(() => void refreshActiveLists(), BACKGROUND_SYNC_POLL_MS);
        return () => clearInterval(timer);
    }, [isVerified, isSwitching, refreshActiveLists]);

    // Trigger 3 — app foreground return. The poll timer freezes while the WebView is suspended and
    // pushes may have been missed; if the socket survived (no rising edge), nothing else re-syncs,
    // so refresh immediately. This does NOT gate on `isVerified`. Recovery is now owned by the SDK
    // AuthController (SocketManager.request no longer self-heals 401s/reconnects): keepAlive closes a
    // zombie socket → reconnect re-auth, and a terminal `expired` escalates via the delegate
    // (relay → logout/redirect, §6-10). So a best-effort foreground refresh is safe — if the socket
    // is momentarily unverified a request may fail, and Trigger 1's false→true rising edge re-syncs
    // once the SDK re-verifies. The `isSwitching` guard remains — mid-switch the socket is rebinding
    // to a new identity, so a fetch could race the wrong session.
    useAppForeground(() => {
        if (isSwitching) return;
        void refreshActiveLists();
        void refreshChannelSnapshot();
    });
};
