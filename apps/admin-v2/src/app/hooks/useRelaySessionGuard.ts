/**
 * `hooks/useRelaySessionGuard.ts`
 * - Keeps the relay HTTP signing credentials fresh while the console stays open.
 *
 * The AWS credentials minted from the relay token expire on the order of an hour. The socket auth
 * loop (RuntimeAuthHost) re-mints them via its refresh writeback only while its socket is healthy —
 * after laptop sleep or a dropped socket nothing refreshes them, so every signed request 403s while
 * `isAuthenticated` stays true (the flag is session-existence, not credential validity). This guard
 * probes staleness READ-ONLY on an interval and on tab re-focus, asks the refresh owner
 * (app-runtime `requestSessionRefresh`) to fix it, and tears the session down to the login screen
 * only when refresh fails REPEATEDLY while online.
 *
 * Two deliberate properties (2026-08 session audit §7 Phase 2):
 *  - The probe (`isStoredSessionExpired`) never fires a refresh itself. The old
 *    `webTransport.isAuthenticated()` check ran lemon-web-core's own HTTP refresh, a second refresh
 *    engine that updated only the lemon store and left the socket's signing material stale — the
 *    signature-error divergence the audit traced.
 *  - Repeated, not single, failure: a transient blip at one 30s tick is indistinguishable from a
 *    dead session, and logging an admin out over a blip is worse than three extra ticks of 403s.
 *    Only CONSECUTIVE_FAILURE_LIMIT definitive failures in a row trigger the teardown; any success
 *    resets the streak.
 */
import { useEffect, useRef } from 'react';

import { requestSessionRefresh } from '@chatic/app-runtime';
import { hasStoredRelaySession, isStoredSessionExpired, logoutRelaySession } from '@chatic/web-core';

/** Cheap when not expired (a few storage reads), so a tight cadence keeps the 403 window small. */
const CHECK_INTERVAL_MS = 30_000;

/** Consecutive definitive failures (~90s of consistent failure) before the zombie teardown. */
const CONSECUTIVE_FAILURE_LIMIT = 3;

export const useRelaySessionGuard = (enabled: boolean): void => {
    const inFlight = useRef(false);
    const failureStreak = useRef(0);

    useEffect(() => {
        if (!enabled) {
            return;
        }

        const check = async (): Promise<void> => {
            // Offline refreshes always fail; skip instead of logging out over a dead link.
            if (inFlight.current || !navigator.onLine) {
                return;
            }
            inFlight.current = true;
            try {
                // No stored session at all — nothing to refresh; count toward the zombie teardown
                // (the console requires a real login, so an evaporated session must land on /auth/login).
                if (!(await hasStoredRelaySession())) {
                    await registerFailure();
                    return;
                }

                // Fresh credentials — nothing to do. This is the steady-state path while the
                // RuntimeAuthHost socket is healthy (its writeback keeps the store ahead of expiry).
                if (!(await isStoredSessionExpired())) {
                    failureStreak.current = 0;
                    return;
                }

                // Stale — ask the refresh owner (socket AuthController first, HTTP fallback second).
                const ok = await requestSessionRefresh('relay');
                if (ok) {
                    failureStreak.current = 0;
                    return;
                }
                await registerFailure();
            } catch {
                // Transient failure (e.g. storage race); the next tick retries.
            } finally {
                inFlight.current = false;
            }
        };

        const registerFailure = async (): Promise<void> => {
            failureStreak.current += 1;
            if (failureStreak.current >= CONSECUTIVE_FAILURE_LIMIT) {
                // Session present but no longer refreshable (or gone) — a zombie. Tear down so the
                // router lands on /auth/login instead of every request failing with 403.
                await logoutRelaySession();
            }
        };

        // Wake-from-sleep / tab re-focus is the main stale-credential moment; check immediately so
        // the first click after returning does not hit a 403.
        const onVisibilityChange = (): void => {
            if (document.visibilityState === 'visible') {
                void check();
            }
        };

        const intervalId = setInterval(() => void check(), CHECK_INTERVAL_MS);
        document.addEventListener('visibilitychange', onVisibilityChange);
        return () => {
            clearInterval(intervalId);
            document.removeEventListener('visibilitychange', onVisibilityChange);
        };
    }, [enabled]);
};
