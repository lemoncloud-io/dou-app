import { useCallback, useEffect, useRef } from 'react';
import { useIsMutating } from '@tanstack/react-query';

import { runtime } from '@chatic/app-runtime';

import { useAppForeground } from '../bridge';
import { INVITE_LIST_LIMIT } from '../hooks/useRelayInvites';
import { useChannelSyncMarkStore } from '../stores/useChannelSyncMarkStore';
import { registerBackgroundRefresh } from './backgroundRefresh';
import { syncStreakReporter } from './logging/syncStreakReporter';

// Periodic background-sync interval. The user-facing requirement is "about a minute"; lists
// only re-discover added/removed entries here, so a coarse cadence is intentional.
const BACKGROUND_SYNC_POLL_MS = 60_000;

/**
 * Global background sync — keeps place/channel/profile lists (and the sender's own relay invites)
 * fresh regardless of route. Ported from the testbed ChatHomePage `refreshActiveLists`, but lifted
 * into the runtime layer so polling continues outside the home page.
 *
 * Triggers:
 *  1. Rising edge of `isVerified` (false→true) — covers app entry, reconnect, and a switch onto a
 *     socket that still has to sign in: the edge fires exactly when that session is verified —
 *     never against the stale pre-switch one. A switch that lands on a socket signed in already
 *     makes no edge; a site switch is Trigger 4's and a cloud switch Trigger 6's.
 *  2. Periodic timer while verified — skipped during an in-flight switch.
 *  3. App foreground return, 4. active site change, 5. an explicit request (pull-to-refresh),
 *     6. the socket coming to serve another cloud while already verified — each described at its
 *     effect below.
 *
 * The periodic tick passes `{ periodic: true }` so a domain can opt out of it while staying on the
 * edges. Only invites use that today: see the block for why polling on behalf of a user with no
 * live card is pure waste.
 *
 * Switch detection is global via `useIsMutating` on the switch mutation keys: the switch is
 * triggered by other components, whose per-hook `isSwitching`/`isPending` is invisible here.
 * This closes the optimistic window (old session still verified=true before the new handshake).
 */
export const useBackgroundSync = (): void => {
    const repos = runtime.data.useRuntimeRepositories();
    const session = runtime.session.useGlobalSession();
    const { selectedSiteId } = runtime.session.useSessionSelection();
    const { isVerified, activeSlot } = runtime.connection.useRuntimeSocketState();
    // Only for the invite block below — issuing an invite requires a phone-verified main user
    // (ADR-0034), so a guest cannot own a card for `invite.list` to return.
    const { isGuest } = runtime.session.useRuntimeProfile();

    const cid = session.activeServer.kind === 'cloud' ? session.activeServer.cloudId : 'default';
    const activeSiteId = selectedSiteId;
    // Scope half of the channel mark below. The observer that reads it keys on {cid, uid} too, so a
    // mark earned by one account cannot open another account's gate.
    const uid = session.identity.userId ?? undefined;
    // Reports that this cloud's channel delta has been answered; the chat section renders off a
    // cache that cannot say so itself (see useChannelSyncMarkStore for what that fixes).
    const markChannelSynced = useChannelSyncMarkStore(state => state.markSynced);
    // channel.get-self is a relay/default-server capability; cloud servers have no notes-to-self
    // channel, so the self-channel fetch is gated to the relay server only.
    const isRelayServer = session.activeServer.kind !== 'cloud';

    const isSwitching =
        useIsMutating({ mutationKey: runtime.session.SWITCH_SITE_MUTATION_KEY }) +
            useIsMutating({ mutationKey: runtime.session.SWITCH_CLOUD_MUTATION_KEY }) >
        0;

    /**
     * Whether the local invite cache holds a card whose state can still move (see the invite block
     * in `refreshActiveLists`). A cache read, not a packet — the whole point is to decide whether a
     * packet is worth sending. An unreadable cache answers "no": the edges re-ask regardless, so
     * the cost of being wrong here is one delayed refresh, not a lost one.
     */
    const hasPendingSentInvite = useCallback(async (): Promise<boolean> => {
        try {
            const { list } = await repos.invite.cacheReadList();
            return list.some(row => row.state === 'pending');
        } catch {
            return false;
        }
    }, [repos.invite]);

    // Place snapshot + channel/profile delta sync with watermarks, plus the sent-invite list.
    // place.refreshList and invite.list are full snapshots (no cursor); channel.syncChannels /
    // profile.syncProfiles are delta APIs, so the stored syncedAt is passed as `since` and the
    // returned syncedAt is persisted back.
    const refreshActiveLists = useCallback(
        async ({ periodic = false }: { periodic?: boolean } = {}) => {
            // These are five INDEPENDENT socket domains (place snapshot, user profile, channel delta,
            // profile delta, sent invites) — they share no data dependency, so run them concurrently.
            // Awaiting them serially cost ~3 sequential socket round trips on every switch / 60s poll /
            // foreground; Promise.all collapses that to one round-trip depth. Each block keeps its own
            // getSyncedAt → sync → setSyncedAt watermark ordering internally.
            // The automatic triggers fire and forget, so awaiting all five changes nothing for them.
            // It is for the pull-to-refresh caller, whose indicator should stay up until the place
            // rail has been re-asked too, not only the channel list.
            await Promise.all([
                repos.place
                    .refreshList()
                    .then(() => syncStreakReporter.succeed('place-refresh'))
                    // Still best-effort — the retry policy is unchanged and the next tick re-asks. What
                    // changes is that a run of failures now says so once instead of never.
                    .catch(error => syncStreakReporter.fail('place-refresh', error)),

                // Refresh the current-session user profile (User domain); the repository caches the embedded
                // $site into the place store. Keeps the account profile + active site fresh.
                repos.user
                    .getMyProfile()
                    .then(() => syncStreakReporter.succeed('my-profile'))
                    // best-effort: a failed profile refresh leaves the previous cache intact
                    .catch(error => syncStreakReporter.fail('my-profile', error)),

                // Channel delta sync — channel.sync spans the whole cloud, so the cursor is keyed by cid.
                // Each channel is stored tagged with its own sid, sgeo this is correct across site switches.
                (async () => {
                    try {
                        const channelSyncKind = `channel-sync:${cid}`;
                        const since = await repos.syncMeta.getSyncedAt(channelSyncKind);
                        const { syncedAt } = await repos.channel.syncChannels(since);
                        await repos.syncMeta.setSyncedAt(channelSyncKind, syncedAt);
                        syncStreakReporter.succeed('channel-delta');
                    } catch (error) {
                        // best-effort: watermark not advanced → retried with the same since next tick.
                        // Which is exactly why a STREAK of these matters — the cursor stays put and the
                        // channel list stops discovering anything (ADR-0099).
                        syncStreakReporter.fail('channel-delta', error);
                    } finally {
                        // Answered, either way — and that is what lets the chat section stop reading
                        // an empty cache as "no rooms". A failure counts: it says something about
                        // reachability, not about the cloud, and a gate that waited for success
                        // would hold a skeleton up through every outage.
                        markChannelSynced(cid, uid);
                    }
                })(),

                // Sent relay invites (ADR-0052). The home rows render straight off the invite cache and
                // `invite.list` mirrors its response there, so this block is now the only thing keeping
                // them converging — the query itself no longer fetches on mount or focus
                // (`useRelayInvites`'s `remote` option carries the why).
                (async () => {
                    // Relay-pinned, and the rows only ever render on the default cloud, so a cloud
                    // session has nothing to refresh here. Skipping also keeps the `isVerified` gate on
                    // the triggers honest for this call: with cid 'default' the ACTIVE slot IS relay,
                    // which is the slot the invite gateway is pinned to.
                    if (cid !== 'default') return;
                    // A guest cannot have issued an invite (the form is main-user-only — ADR-0034),
                    // so their list is guaranteed empty and asking is pure cost. Worth a line of its
                    // own because apps/web auto-boots a guest session for anyone not signed in: they
                    // are a large share of home mounts, and this takes them to zero packets rather
                    // than one per edge. Guest-ness is seeded synchronously from the session token,
                    // so it is already correct at the rising edge; a guest→main promotion commits a
                    // new token, which re-authenticates and fires the edge again.
                    if (isGuest) return;
                    // An invite only changes on the RECIPIENT's device and no packet announces it
                    // (backend request #4), so freshness has to be asked for — but only while a card can
                    // still change. `pending` is that set: `accepted`/`canceled`/`rejected` are final,
                    // and an `expired` card cannot be accepted any more. A user with no pending card
                    // (which is most users, most of the time) therefore sends nothing on the tick.
                    // The EDGES still ask unconditionally, and that is what discovers a card this
                    // device has never seen — one issued from another device, or a cleared cache.
                    if (periodic && !(await hasPendingSentInvite())) return;
                    try {
                        await repos.invite.list({ limit: INVITE_LIST_LIMIT });
                        syncStreakReporter.succeed('sent-invites');
                    } catch (error) {
                        // best-effort: the next edge or tick re-asks
                        syncStreakReporter.fail('sent-invites', error);
                    }
                })(),

                // Profile delta sync — cursor keyed by {cid, sid}. Passing since=0 every tick would re-pull
                // everything and lose removal deltas, so the watermark must advance. Skipped without a site.
                (async () => {
                    if (!activeSiteId) return;
                    try {
                        const profileSyncKind = `profile-sync:${cid}:${activeSiteId}`;
                        const since = await repos.syncMeta.getSyncedAt(profileSyncKind);
                        const { syncedAt } = await repos.profile.syncProfiles(since, activeSiteId);
                        await repos.syncMeta.setSyncedAt(profileSyncKind, syncedAt);
                        syncStreakReporter.succeed('profile-delta');
                    } catch (error) {
                        // best-effort: watermark not advanced → retried with the same since next tick
                        syncStreakReporter.fail('profile-delta', error);
                    }
                })(),
            ]);
        },
        [
            repos.place,
            repos.user,
            repos.channel,
            repos.profile,
            repos.syncMeta,
            repos.invite,
            hasPendingSentInvite,
            isGuest,
            cid,
            uid,
            activeSiteId,
            markChannelSynced,
        ]
    );

    // Load the "나와의 채팅" (notes-to-self) channel for the active site via channel.get-self, which
    // caches it so it appears in the channel list. Runs on every place entry (rising edge + site
    // switch); the cloud-wide delta sync (syncChannels) keeps the rest of the list converging, so no
    // full channel.mine snapshot is needed here.
    const loadSelfChannel = useCallback(async () => {
        // Only when a place is selected AND we are on the relay server (not a cloud server) —
        // cloud servers do not expose channel.get-self.
        if (!activeSiteId || !isRelayServer) return;
        try {
            await repos.channel.getSelfChannel(undefined, activeSiteId);
            syncStreakReporter.succeed('self-channel');
        } catch (error) {
            // best-effort: retried on the next place entry
            syncStreakReporter.fail('self-channel', error);
        }
    }, [repos.channel, activeSiteId, isRelayServer]);

    // prevSiteRef is shared by Triggers 1, 6 and 4 (declared once, above all three) so the trigger that
    // handles a cloud switch can advance the site watermark and Trigger 4 does not re-fire the same
    // sync for the new cloud's site.
    const prevSiteRef = useRef(activeSiteId);
    const prevVerifiedRef = useRef(false);
    // The cloud the lists were last asked for on a socket that serves it, cleared whenever the socket
    // serves another. Shared by Trigger 1 and Trigger 6 for the same reason as prevSiteRef: a switch
    // onto a cold slot fires both.
    const syncedCloudRef = useRef<string | null>(null);
    const isServingCid = activeSlot === cid;

    // Trigger 1 — rising edge of isVerified (app entry / reconnect / switch completion).
    useEffect(() => {
        const becameVerified = !prevVerifiedRef.current && isVerified;
        prevVerifiedRef.current = isVerified;
        if (becameVerified) {
            // A cloud switch onto a cold slot lands on a new sid AND fires this rising edge; advance the
            // site watermark here so Trigger 4 sees an unchanged sid and does not duplicate the fetch.
            prevSiteRef.current = activeSiteId;
            // Only an edge on the socket that serves this cloud answers for it. An outgoing socket
            // reconnecting mid-switch is not that, and must leave Trigger 6 its turn.
            if (isServingCid) syncedCloudRef.current = cid;
            void refreshActiveLists();
            void loadSelfChannel();
        }
    }, [isVerified, activeSiteId, isServingCid, cid, refreshActiveLists, loadSelfChannel]);

    // Trigger 6 — the socket comes to serve another cloud while it is already verified. Every joined
    // cloud keeps a socket session in the background, so a switch into one usually lands on a slot
    // that is verified already: the active slot moves, `isVerified` reads true before and after, and
    // Trigger 1 never fires. A cloud switch also empties the selected site, so Trigger 4 has nothing
    // to go on. Left to the periodic tick, a cloud this device holds no cached places for showed an
    // empty home for up to a minute, with nothing to auto-select. Fires once the switch has settled
    // and the active slot is the committed cloud's — not before, or the outgoing socket would answer
    // and the repositories would drop it as foreign. Once per arrival: the mark is cleared whenever
    // the socket serves another cloud, so coming back asks again even when the cloud in between never
    // got far enough to be marked (tapped away mid-switch, or a slot that never signed in). A switch
    // onto a cold slot reaches here only after its rising edge, which already marked this cloud, so
    // it is not fetched twice.
    //
    // Declared ahead of Trigger 4 on purpose. A switch back to the relay (leaving the cloud session,
    // which is no switch mutation) restores the relay's selected site one render before the active
    // slot follows, and Trigger 4 waits for that slot too. Both then become eligible in the same
    // render; effects run in order, so this claims the fetch and advances prevSiteRef, and Trigger 4
    // sees no change instead of asking a second time.
    useEffect(() => {
        if (!isServingCid) {
            syncedCloudRef.current = null;
            return;
        }
        if (!isVerified || isSwitching) return;
        if (syncedCloudRef.current === cid) return;
        syncedCloudRef.current = cid;
        prevSiteRef.current = activeSiteId;
        void refreshActiveLists();
        void loadSelfChannel();
    }, [cid, isServingCid, isVerified, isSwitching, activeSiteId, refreshActiveLists, loadSelfChannel]);

    // Trigger 2 — periodic poll while verified, skipped during an in-flight switch (the optimistic
    // window can leave the old session briefly verified=true; the rising edge handles completion).
    useEffect(() => {
        if (!isVerified || isSwitching) return;
        const timer = setInterval(() => void refreshActiveLists({ periodic: true }), BACKGROUND_SYNC_POLL_MS);
        return () => clearInterval(timer);
    }, [isVerified, isSwitching, refreshActiveLists]);

    // Trigger 4 — active site (sid) change. A SITE switch drives SDK `auth.switch` on the SAME socket,
    // which stays `authenticated` throughout (no isVerified false→true), so Trigger 1 never fires for
    // it — without this, a site the user only ever reached via a switch is never fetched and its
    // channel list stays empty. Fire once the switch settles (verified + not mid-switch), the socket
    // serves the committed cloud, and the sid actually changed. A CLOUD switch is Trigger 1's (a cold
    // slot's rising edge) or Trigger 6's (a slot verified already), and both advance prevSiteRef to
    // the new sid — so this stays quiet and does not double-fetch. The slot check is what keeps it
    // so on the way back to the relay: the relay's site returns a render before the slot does, and
    // firing then would ask once here and once more from Trigger 6.
    useEffect(() => {
        if (!isVerified || isSwitching || !isServingCid || !activeSiteId) return;
        if (prevSiteRef.current === activeSiteId) return;
        prevSiteRef.current = activeSiteId;
        void refreshActiveLists();
        void loadSelfChannel();
    }, [activeSiteId, isVerified, isSwitching, isServingCid, refreshActiveLists, loadSelfChannel]);

    // Trigger 3 — app foreground return. The poll timer freezes while the WebView is suspended and
    // pushes may have been missed, so re-sync on resume. Gated on `isVerified` so we only fire against
    // an authenticated socket and skip the wasted round-trips a momentarily-unverified socket would
    // reject:
    //  - Socket survived suspension (still verified) → no rising edge fires, so this is the only
    //    re-sync path, and the guard passes → fires here.
    //  - Socket died (unverified on resume) → this skips; recovery is owned by the runtime:
    //    useSocketWakeRecovery force-recycles the slot on this same foreground signal (else the
    //    keep-alive loop closes the zombie → reconnect re-auth). A terminal relay `expired` does
    //    NOT auto-logout (delegate policy is warn-only — 2026-08 session audit §3); the wake kick
    //    re-seeds it. Trigger 1's false→true rising edge then re-syncs once the SDK re-verifies,
    //    so the foreground refresh is deferred to auth completion rather than lost.
    // The `isSwitching` guard remains — mid-switch the socket is rebinding to a new identity, so a
    // fetch could race the wrong session. The handler is a fresh closure each render, so `isVerified`
    // is read live (not captured stale) — see useAppVisibility's handlerRef.
    useAppForeground(() => {
        if (!isVerified || isSwitching) return;
        void refreshActiveLists();
    });

    // Trigger 5 — on request, from home's pull-to-refresh. The same pass the edges run, self channel
    // included since a pull is a user asking for the place to be re-read, and under the same guards
    // as the foreground signal: an unverified or mid-switch socket would answer for the wrong
    // session, so the request settles at once and the indicator goes away instead of lying.
    // Registered once; the ref keeps the handler reading this render's guards and callbacks.
    // A request made while one is still running joins it rather than starting a second pass: two
    // passes read the same delta watermark, and whichever answers last writes it back.
    const manualRefreshRef = useRef<() => Promise<void>>(() => Promise.resolve());
    const manualInFlightRef = useRef<Promise<void> | null>(null);
    useEffect(() => {
        manualRefreshRef.current = () => {
            if (!isVerified || isSwitching) return Promise.resolve();
            if (manualInFlightRef.current) return manualInFlightRef.current;
            const pass = Promise.all([refreshActiveLists(), loadSelfChannel()])
                .then(() => undefined)
                .finally(() => {
                    manualInFlightRef.current = null;
                });
            manualInFlightRef.current = pass;
            return pass;
        };
    });
    useEffect(() => registerBackgroundRefresh(() => manualRefreshRef.current()), []);
};
