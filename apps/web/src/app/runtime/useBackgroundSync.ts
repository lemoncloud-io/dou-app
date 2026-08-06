import { useCallback, useEffect, useRef } from 'react';
import { useIsMutating } from '@tanstack/react-query';

import { useRuntimeRepositories, useRuntimeSocketState } from '@chatic/app-runtime';
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
    const { isVerified } = useRuntimeSocketState();

    const cid = session.activeServer.kind === 'cloud' ? session.activeServer.cloudId : 'default';
    const activeSiteId = selectedSiteId;
    // channel.get-self is a relay/default-server capability; cloud servers have no notes-to-self
    // channel, so the self-channel fetch is gated to the relay server only.
    const isRelayServer = session.activeServer.kind !== 'cloud';

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
            // Each channel is stored tagged with its own sid, sgeo this is correct across site switches.
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

    // Load the "나와의 채팅" (notes-to-self) channel for the active site via channel.get-self, which
    // caches it so it appears in the channel list. Runs on every place entry (rising edge + site
    // switch); the cloud-wide delta sync (syncChannels) keeps the rest of the list converging, so no
    // full channel.mine snapshot is needed here.
    const loadSelfChannel = useCallback(async () => {
        // Only when a place is selected AND we are on the relay server (not a cloud server) —
        // cloud servers do not expose channel.get-self.
        if (!activeSiteId || !isRelayServer) return;
        try {
            await repos.channel.getSelfChannel();
        } catch {
            // best-effort: retried on the next place entry
        }
    }, [repos.channel, activeSiteId, isRelayServer]);

    // prevSiteRef is shared by Trigger 1 and Trigger 4 (declared once, above both) so the rising edge
    // can advance the site watermark and Trigger 4 does not re-fire the same sync on a cloud switch.
    const prevSiteRef = useRef(activeSiteId);
    const prevVerifiedRef = useRef(false);

    // Trigger 1 — rising edge of isVerified (app entry / reconnect / switch completion).
    useEffect(() => {
        const becameVerified = !prevVerifiedRef.current && isVerified;
        prevVerifiedRef.current = isVerified;
        if (becameVerified) {
            // A cloud switch lands on a new sid AND fires this rising edge; advance the site watermark
            // here so Trigger 4 sees an unchanged sid and does not duplicate the fetch below.
            prevSiteRef.current = activeSiteId;
            void refreshActiveLists();
            void loadSelfChannel();
        }
    }, [isVerified, activeSiteId, refreshActiveLists, loadSelfChannel]);

    // Trigger 2 — periodic poll while verified, skipped during an in-flight switch (the optimistic
    // window can leave the old session briefly verified=true; the rising edge handles completion).
    useEffect(() => {
        if (!isVerified || isSwitching) return;
        const timer = setInterval(() => void refreshActiveLists(), BACKGROUND_SYNC_POLL_MS);
        return () => clearInterval(timer);
    }, [isVerified, isSwitching, refreshActiveLists]);

    // Trigger 4 — active site (sid) change. A SITE switch drives SDK `auth.switch` on the SAME socket,
    // which stays `authenticated` throughout (no isVerified false→true), so Trigger 1 never fires for
    // it — without this, a site the user only ever reached via a switch is never fetched and its
    // channel list stays empty. Fire once the switch settles (verified + not mid-switch) and the sid
    // actually changed. A CLOUD switch instead reboots the socket and fires Trigger 1, which already
    // advanced prevSiteRef to the new sid — so this stays quiet and does not double-fetch.
    useEffect(() => {
        if (!isVerified || isSwitching || !activeSiteId) return;
        if (prevSiteRef.current === activeSiteId) return;
        prevSiteRef.current = activeSiteId;
        void refreshActiveLists();
        void loadSelfChannel();
    }, [activeSiteId, isVerified, isSwitching, refreshActiveLists, loadSelfChannel]);

    // Trigger 3 — app foreground return. The poll timer freezes while the WebView is suspended and
    // pushes may have been missed, so re-sync on resume. Gated on `isVerified` so we only fire against
    // an authenticated socket and skip the wasted round-trips a momentarily-unverified socket would
    // reject:
    //  - Socket survived suspension (still verified) → no rising edge fires, so this is the only
    //    re-sync path, and the guard passes → fires here.
    //  - Socket died (unverified on resume) → this skips; recovery is owned by the SDK AuthController
    //    (SocketManager.request no longer self-heals 401s/reconnects): keepAlive closes a zombie socket
    //    → reconnect re-auth, and a terminal `expired` escalates via the delegate (relay →
    //    logout/redirect, §6-10). Trigger 1's false→true rising edge then re-syncs once the SDK
    //    re-verifies, so the foreground refresh is deferred to auth completion rather than lost.
    // The `isSwitching` guard remains — mid-switch the socket is rebinding to a new identity, so a
    // fetch could race the wrong session. The handler is a fresh closure each render, so `isVerified`
    // is read live (not captured stale) — see useAppVisibility's handlerRef.
    useAppForeground(() => {
        if (!isVerified || isSwitching) return;
        void refreshActiveLists();
    });
};
