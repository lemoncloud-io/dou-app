/**
 * `hooks/useRelaySessionGuard.ts`
 * - Keeps the relay HTTP signing credentials fresh while the console stays open.
 *
 * The probe/refresh body now lives in `@chatic/app-runtime`'s `useSessionStalenessGuard`
 * (ADR-0070 3단계 체크리스트 7) — apps/web had invented the same thing independently, and
 * desktop-web/testbed had neither. What is left here is admin-v2's POLICY, which is what actually
 * differs between the two apps:
 *
 *  - a 30s interval plus a re-check on tab focus (wake-from-sleep is the main stale moment for a
 *    desktop console, and the probe is cheap — a few storage reads — when nothing is expired), and
 *  - a zombie teardown: a console requires a real login, so a session that is gone or no longer
 *    refreshable must land on /auth/login rather than leave every request 403-ing.
 *
 * The teardown fires only on CONSECUTIVE failures: a transient blip at one 30s tick is
 * indistinguishable from a dead session, and logging an admin out over a blip is worse than three
 * extra ticks of 403s. Any success resets the streak (the shared hook owns that counting).
 */
import { logoutRelaySession, useSessionStalenessGuard } from '@chatic/app-runtime';

/** Cheap when not expired, so a tight cadence keeps the 403 window small. */
const CHECK_INTERVAL_MS = 30_000;

/** Consecutive definitive failures (~90s of consistent failure) before the zombie teardown. */
const CONSECUTIVE_FAILURE_LIMIT = 3;

export const useRelaySessionGuard = (enabled: boolean): void => {
    useSessionStalenessGuard({
        enabled,
        intervalMs: CHECK_INTERVAL_MS,
        checkOnVisible: true,
        // No stored session at all is a definitive failure here — the console cannot run signed out.
        missingSessionCountsAsFailure: true,
        consecutiveFailureLimit: CONSECUTIVE_FAILURE_LIMIT,
        onTeardown: () => logoutRelaySession(),
    });
};
