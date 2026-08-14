import { useEffect, useRef } from 'react';

import { requestSessionRefresh, useKindVerified } from '@chatic/app-runtime';
import { logger } from '@chatic/bridges';
import { hasStoredRelaySession, isStoredSessionExpired } from '@chatic/web-core';

import { useAppForeground } from '../bridge';

/**
 * Re-mints stale relay HTTP signing credentials (lemon-web-core's AWS credential cache) once the
 * relay socket is up.
 *
 * Boot used to re-mint them implicitly: `webTransport.init()` fired lemon's own HTTP refresh
 * whenever the stored `expired_time` (= credential Expiration − 5min) had passed. Sealing that
 * refresh out of the boot path (2026-08 session audit §7 Phase 2-2) removed it, and apps/web never
 * got a replacement caller — admin-v2 got `useRelaySessionGuard`, apps/web got nothing.
 *
 * The socket does not close the gap on its own: the initial `auth.update` reply is handled without
 * emitting a token (only `auth.refresh` / `auth.switch` emit — SDK `handleAuthResponse`), so the
 * first writeback lands one refresh cycle after connect — `refreshIntervalMs` (5min) while the
 * server omits `expiresIn`. Until then a returning user signs every relay HTTP request with a dead
 * credential.
 *
 * Relay chat hides this (socket auth signs a lemon HMAC over relayCore, not the AWS credential),
 * but the cloud entry path is pure relay-signed HTTP — `POST /users/0/delegate-cloud` and
 * `GET /clouds/0/list` — so a cloud place's channel list cannot load while the credential is stale.
 *
 * GATED ON THE RELAY SLOT BEING VERIFIED, deliberately. `requestSessionRefresh` is the single
 * refresh entry point, but it only reaches the OWNER (the SDK AuthController's `runRefresh`) when
 * a live authenticated socket exists; called at mount it would always fall through to the HTTP
 * fallback, re-adding the boot-time HTTP refresh Phase 2-2 removed. Waiting for the rising edge
 * keeps the actual refresh inside the socket — we only ask it to run now instead of up to 5min
 * from now. Cost: relay-signed HTTP stays stale until the handshake completes (~1-2s), so a cloud
 * entry inside that window can still fail once.
 *
 * Unlike admin-v2's guard this NEVER logs out: relay logout is manual-only in apps/web (see the
 * socket session delegate's `onAuthExpired`), so a failed refresh just retries on the next edge.
 */
export const useRelayCredentialRefresh = (): void => {
    const isRelayVerified = useKindVerified('relay');

    // Concurrency guard only — the probe itself is a few storage reads, so a repeated signal that
    // arrives after a completed run simply re-probes and returns early.
    const inFlightRef = useRef(false);

    const refreshIfStale = async (): Promise<void> => {
        // Offline refreshes always fail; skip instead of burning a request on a dead link.
        if (inFlightRef.current || !navigator.onLine) return;
        inFlightRef.current = true;
        try {
            // No stored session (logged out / first visit) — nothing to refresh. Never a logout
            // signal here: that policy lives in the socket delegate.
            if (!(await hasStoredRelaySession())) return;
            // Steady state while the socket writeback keeps the store ahead of expiry.
            if (!(await isStoredSessionExpired())) return;

            const ok = await requestSessionRefresh('relay');
            if (!ok) {
                logger.warn('SESSION', '[useRelayCredentialRefresh] stale relay credentials not refreshed');
            }
        } catch (error) {
            // Transient (storage race, refresh rejection) — the next verified edge / foreground retries.
            logger.warn('SESSION', '[useRelayCredentialRefresh] credential probe failed', { error });
        } finally {
            inFlightRef.current = false;
        }
    };

    // Rising edge of relay verification — app entry and every reconnect re-auth. This is the moment
    // the socket path becomes available, and also the moment a returning user is most likely to be
    // carrying an expired credential.
    const prevVerifiedRef = useRef(false);
    useEffect(() => {
        const becameVerified = !prevVerifiedRef.current && isRelayVerified;
        prevVerifiedRef.current = isRelayVerified;
        if (becameVerified) {
            void refreshIfStale();
        }
        // refreshIfStale is a fresh closure each render over refs only — no stale capture to track.
    }, [isRelayVerified]);

    // Foreground return on a socket that survived suspension: no rising edge fires, yet the
    // credential may have lapsed while the WebView slept. Skipped when the socket is down — the
    // edge above covers that case once useSocketWakeRecovery gets it back.
    useAppForeground(() => {
        if (!isRelayVerified) return;
        void refreshIfStale();
    });
};
