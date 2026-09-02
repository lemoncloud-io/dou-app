import { useKindVerified, useSessionStalenessGuard } from '@chatic/app-runtime';

import { useAppForeground } from '../bridge';

/**
 * Re-mints stale relay HTTP signing credentials (lemon-web-core's AWS credential cache) once the
 * relay socket is up.
 *
 * The probe/refresh body now lives in `@chatic/app-runtime`'s `useSessionStalenessGuard`
 * (ADR-0070 3단계 체크리스트 7) — admin-v2 had invented the same thing independently. What stays
 * here is apps/web's POLICY, and the two triggers are the whole point:
 *
 * **Rising edge of relay verification, not an interval.** `requestRelaySessionRefresh` only reaches the
 * refresh OWNER (the SDK AuthController) when a live authenticated socket exists. Polling at mount
 * would just fail until the handshake completes; waiting for the edge keeps the refresh inside the
 * socket and only asks it to run NOW instead of up to 5 min from now. Cost: relay-signed HTTP stays
 * stale until the handshake (~1-2s), so a cloud entry inside that window can still fail once.
 *
 * **Foreground return**, because a socket that survived suspension fires no rising edge, yet the
 * credential may have lapsed while the WebView slept. That trigger is a bridge concept the hub
 * cannot know about, which is why the hub hands back `check`.
 *
 * **Never logs out**, unlike admin-v2's guard: relay logout is manual-only in apps/web (see the
 * socket session delegate's `onAuthExpired`), so a failed refresh just retries on the next edge.
 *
 * Why this exists at all: boot used to re-mint credentials implicitly through lemon's own HTTP
 * refresh, and sealing that out (2026-08 session audit §7 Phase 2-2) left apps/web with no
 * replacement caller. The socket does not close the gap on its own — the initial `auth.update` reply
 * emits no token, so the first writeback lands one refresh cycle after connect. Relay chat hides
 * this (socket auth signs a lemon HMAC, not the AWS credential), but the cloud entry path is pure
 * relay-signed HTTP, so a cloud place's channel list cannot load while the credential is stale.
 */
export const useRelayCredentialRefresh = (): void => {
    const { check } = useSessionStalenessGuard({
        intervalMs: null,
        checkOnRelayVerified: true,
        // Both triggers here are EDGES (first verification, foreground return), and at exactly those
        // moments the stored `expired_time` is a bad proxy for "the credential still signs": the
        // handshake's `auth.update` emits no token, so boot runs on the pre-sleep credential until
        // the SDK's own 5-min timer fires. Refresh regardless of the expiry probe — the hub throttles
        // this to once a minute and never counts a preemptive miss as a failure.
        forceRefresh: true,
        // apps/web never tears the session down from here.
        consecutiveFailureLimit: null,
    });

    // Gated on the socket being up: with no live socket `check` cannot reach the refresh owner, so
    // it would only log a failure. The rising edge above covers that case once the socket returns
    // (useSocketWakeRecovery).
    const isRelayVerified = useKindVerified('relay');
    useAppForeground(() => {
        if (!isRelayVerified) return;
        void check();
    });
};
