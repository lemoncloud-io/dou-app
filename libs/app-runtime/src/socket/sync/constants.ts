/**
 * The sync module's value constants.
 *
 * `UNREGISTER_GRACE_MS` used to be exported from `SyncManager.ts` — a class file handing out a
 * constant so its test could advance timers past the grace window. The value is the same; what
 * changes is that the class file now holds only the class (see the module doc's §File placement rule).
 */

/**
 * The grace period before a target whose refs hit 0 is actually stopped (ADR-0058).
 *
 * A screen transition repeats the previous screen's unregister and the next screen's register a few
 * ms apart, and stopping immediately made the scheduler **discard the target and its snapshot
 * together**, producing one immediate poll per re-registration (`scheduleNow(0)`) plus one
 * "unconditionally changed" cache write from the missing snapshot — the identity of the
 * `save:channel` 228 / `save:join` 632 spikes caught in the 2026-08-14 flood audit. A re-registration
 * within the grace period takes `register`'s existing merge path and joins the still-live target
 * as-is, so there is neither a restart nor a re-poll.
 *
 * 30 seconds: generously covers a room↔home round trip (usually a few seconds) without letting a
 * departed channel's polling survive too long in the background. A grace-period target's polling
 * keeps its idle backoff going (up to 60s), so the residual cost is at most one or two requests per
 * channel.
 */
export const UNREGISTER_GRACE_MS = 30_000;
