/**
 * Which structured observation an entry is.
 *
 * A handful of triggers do not report a failure — they report a measurement: two values that
 * disagreed, a window's worth of drops, a streak of failed syncs, how much the queue evicted, what
 * shape a result came back in. Those entries are read by scripts as much as by people, because the
 * stored logs cannot be filtered by value: the admin list narrows on `level`, `runId` and date only,
 * and the payload arrives inside a length-capped `data` string. So the workflow is "download the
 * `warn` page, then split it by family" — and that split needs one key with a closed set of values.
 *
 * It used to need three. Each producer invented its own envelope (`divergence.kind`,
 * `foreignDrop.source`) and one of them collided outright: the sync-cursor entry carried a `kind`
 * meaning "which cursor", next to a divergence `kind` meaning "which comparison". A script had to
 * know all of them and could still read the wrong field.
 *
 * Now every such entry carries `observation` at the top of its `data`, with its own fields beside
 * it — see {@link ObservationData}.
 */
export type ObservationKind =
    /** The app-icon badge the web derived vs the value the device is showing. */
    | 'badge-divergence'
    /** A channel list count vs the read cursor the room had already marked. */
    | 'unread-divergence'
    /** A channel's roster vs the join records that say who is in it. */
    | 'member-divergence'
    /** A locally cached cloud name vs the one the relay catalog answers. */
    | 'cloud-name-divergence'
    /** Cache writes and socket frames dropped because the socket served another cloud. */
    | 'foreign-drop'
    /** Consecutive background-sync failures on one path, and their recovery. */
    | 'sync-streak'
    /**
     * Consecutive socket requests lost because the slot had no connection, and their recovery.
     *
     * Aggregated rather than logged per request for the usual reason: while a socket is down every
     * registered sync target fails on every poll, so the per-request entry is a burst that says the
     * same thing each time. Failures the server actually answered are not this — those get their own
     * entry, because each one is a separate decision about a separate request.
     */
    | 'socket-unavailable-streak'
    /** A sync cursor thrown away, forcing a full re-sync. */
    | 'sync-cursor-retired'
    /** How much the unsent log queue evicted. */
    | 'queue-loss'
    /** How much of a fetched result was usable — the partial-result shape. */
    | 'contacts-shape';

/**
 * The `data` payload of a structured observation: the discriminator, then that observation's own
 * fields as siblings.
 *
 * Flat rather than nested under a per-family key, so a reader does `data.observation` once instead
 * of probing for whichever envelope this producer happened to use.
 *
 * On `error`-level entries this is the `data` inside `{ error, data }` — `error` is the only level
 * whose signature differs, and passing these fields at the top level there would nest them under
 * `data.data` and bury the exception.
 */
export interface ObservationData {
    observation: ObservationKind;
    [field: string]: unknown;
}
