/**
 * `hooks/useRelaySessionGuard.ts`
 * - Keeps the relay HTTP signing credentials fresh while the console stays open.
 *
 * The AWS credentials minted from the relay token expire on the order of an hour. The socket auth
 * loop (RuntimeAuthHost) re-mints them only while its socket is connected — after laptop sleep or a
 * dropped socket nothing refreshes them, so every signed request 403s while `isAuthenticated` stays
 * true (the flag only flips on explicit logout). This guard re-runs the same check the boot path
 * uses (`webTransport.isAuthenticated()`, which internally refreshes an expired token through the
 * lemon OAuth refresh) on an interval and on tab re-focus, and tears the session down to the login
 * screen when the refresh fails REPEATEDLY while online.
 *
 * Repeatedly, not once: lemon-web-core's `isAuthenticated()` swallows every refresh error into
 * `false` — a transient network blip at one 30s tick is indistinguishable from a dead session, and
 * logging an admin out over a blip is worse than three extra ticks of 403s (2026-08 session audit
 * §5-4). Only CONSECUTIVE_FAILURE_LIMIT definitive `false` results in a row trigger the teardown;
 * any success resets the streak.
 */
import { useEffect, useRef } from 'react';

import { logoutRelaySession, webTransport } from '@chatic/web-core';

/** Cheap when not expired (a few storage reads), so a tight cadence keeps the 403 window small. */
const CHECK_INTERVAL_MS = 30_000;

/** Consecutive definitive-`false` checks (~90s of consistent failure) before the zombie teardown. */
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
                const ok = await webTransport.isAuthenticated();
                if (ok) {
                    failureStreak.current = 0;
                    return;
                }
                failureStreak.current += 1;
                if (failureStreak.current >= CONSECUTIVE_FAILURE_LIMIT) {
                    // Token present but no longer refreshable — a zombie session. Tear down so the
                    // router lands on /auth/login instead of every request failing with 403.
                    await logoutRelaySession();
                }
            } catch {
                // Transient failure (e.g. storage/network race); the next tick retries.
            } finally {
                inFlight.current = false;
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
