/**
 * `hooks/useRelaySessionGuard.ts`
 * - Keeps the relay HTTP signing credentials fresh while the console stays open.
 *
 * The probe/refresh body lives in `@chatic/app-runtime`'s `runtime.session.useSessionStalenessGuard`
 * (ADR-0070 3단계 체크리스트 7). What is left here is admin-v2's POLICY — and that policy is now
 * REFRESH ONLY: this guard no longer ends sessions.
 *
 * **Why the teardown is gone.** It was a second logout engine, and the speculative one. A relay
 * refresh can only travel through a live authenticated socket, so "the refresh did not run" is a
 * statement about the SOCKET, not about the session — after a laptop sleep or a dropped link the
 * SDK keep-alive needs ~40-80s to notice a half-open socket and reconnect, while three 30s ticks
 * tore the session down at 90s. The guard usually won that race and logged admins out of sessions
 * that were seconds from healing. Every such logout was a guess.
 *
 * The fact-based engine was there the whole time: on an auth failure the HTTP client re-mints the
 * credential and replays the request once, and only if the server refuses AGAIN does
 * `onAuthFailure` end the session (`http/authFailureReaction`, which this console points at a
 * banner — see `useAuthFailureNotice`). A console fires requests constantly, so a genuinely dead
 * session surfaces in seconds through the path that actually asked the server.
 *
 * What stays is the cadence, which is still worth having: a 30s interval, a re-check on tab focus
 * (wake-from-sleep is the main stale moment for a desktop console) and one on the rising edge of
 * relay verification (the moment a refresh becomes possible at all). The probe is cheap — a few
 * storage reads — when nothing is expired.
 */
import { runtime } from '@chatic/app-runtime';

/** Cheap when not expired, so a tight cadence keeps the 403 window small. */
const CHECK_INTERVAL_MS = 30_000;

export const useRelaySessionGuard = (enabled: boolean): void => {
    runtime.session.useSessionStalenessGuard({
        enabled,
        intervalMs: CHECK_INTERVAL_MS,
        checkOnVisible: true,
        // The rising edge of relay verification is the moment a refresh becomes POSSIBLE
        // (`requestRelaySessionRefresh` only reaches the owner through a live authenticated socket),
        // so a console whose socket just healed re-mints now instead of up to 30s from now.
        checkOnRelayVerified: true,
        // Nothing below this line: no `onTeardown`, and therefore no `consecutiveFailureLimit` and
        // no `missingSessionCountsAsFailure` — the three options only ever fed the teardown. Ending
        // the session belongs to the server's verdict, not to this probe's failures.
    });
};
