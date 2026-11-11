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

/**
 * How often a cloud the user is not looking at asks its server what changed (`channel.sync`).
 *
 * The same minute the apps' own background sync polls the cloud on screen at: a list only
 * re-discovers added and removed rooms, last messages and unread counts here, and a minute is what
 * "fresh enough to show a count" was already taken to mean. Each tick is one request per cloud.
 */
export const BACKGROUND_RECEIVE_INTERVAL_MS = 60_000;

/**
 * How long a background cloud waits after a `chat.sync` push before asking for the delta. A burst of
 * messages arrives as a burst of frames, and one delta answers all of them.
 */
export const BACKGROUND_RECEIVE_DEBOUNCE_MS = 300;

/**
 * How often a background cloud re-reads its place list (`user.mysite`). Places change rarely — they
 * are created and renamed by hand — but a room is listed under its place, so a list that never
 * learned a new place would hide that place's rooms. Also read on the first delta a cloud answers.
 */
export const BACKGROUND_PLACE_REFRESH_MS = 10 * 60_000;
