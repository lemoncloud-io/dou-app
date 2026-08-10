/** How many recent paths to keep. Enough to see how the user got somewhere, small enough to attach to a report. */
export const ROUTE_TRAIL_SIZE = 10;

/** Oldest-first ring buffer of visited paths. Module-level so it survives route remounts. */
let trail: string[] = [];

/**
 * Record a visited path. Consecutive duplicates are ignored — a router
 * resubscribe or a search-param-only change should not push the real previous
 * screen out of the buffer.
 *
 * SECURITY: callers must pass `pathname` ONLY, never `search`/`href`. The trail
 * is attached to feedback reports, which land in a shared Slack channel, and the
 * app carries capability tokens in query strings (`/invite/accept?...`, `/s?...`).
 * Path segments are opaque resource ids, which the report already carries; query
 * strings are credentials, which it must not.
 */
export const recordRoute = (path: string): void => {
    if (!path) return;
    if (trail[trail.length - 1] === path) return;
    trail.push(path);
    if (trail.length > ROUTE_TRAIL_SIZE) trail = trail.slice(-ROUTE_TRAIL_SIZE);
};

/** Visited paths, oldest first. The last entry is the current screen. */
export const getRouteTrail = (): string[] => [...trail];

/** Test-only reset — the buffer is module state shared across a test file. */
export const resetRouteTrail = (): void => {
    trail = [];
};
