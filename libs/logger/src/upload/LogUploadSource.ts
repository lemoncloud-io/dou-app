import type { LogEntry } from '../core/types';

/**
 * Where a batch is drawn from, and how it is released once the server has it.
 *
 * The uploader must not know whether the entries live in this runtime or behind
 * a bridge in the native shell — that choice belongs to a single injection point
 * at boot. Both implementations obey the same two-step contract:
 *
 *     fetch (non-destructive) → send → ack (release)
 *
 * A single destructive read cannot satisfy it. It deletes the only copy before
 * the send has succeeded, so a process that dies in between loses the entries
 * outright — and the entries most worth having are the ones written just before
 * a crash. @see ADR-0063
 *
 * Deliberately an interface, not a base class: implementations live outside
 * this package (`apps/web`'s bridge-backed source is an object literal) and
 * only some of them are class-shaped.
 */
export interface LogUploadSource {
    /**
     * Up to `limit` entries, oldest first, WITHOUT removing them. Handing back
     * the same entries on a later call is correct and expected: `ack` is the
     * only thing that releases them.
     */
    fetch(limit: number): Promise<LogEntry[]>;

    /**
     * Releases entries the pipeline is done with.
     *
     * Called both for a batch the server accepted and for one being given up on
     * — both mean "stop holding these", and which it was has already been
     * decided by the caller.
     *
     * Takes entries rather than ids so an entry that somehow carries no `id`
     * is still releasable (the queue falls back to identity matching). A remote
     * implementation extracts the ids itself before it puts them on the wire —
     * the port shape does not dictate the payload shape. Were this `ids` only,
     * an id-less entry could never be released and would be re-fetched forever.
     */
    ack(entries: LogEntry[]): Promise<void>;

    /**
     * Best-known count of entries waiting to be sent, or `undefined` when the
     * source cannot answer synchronously.
     *
     * The size trigger fires from `notify`, which runs once per dispatched entry
     * and therefore cannot await. A remote source answers from the count its
     * last round trip reported — approximate on purpose, since the periodic
     * flush delivers either way and an exact answer would cost a bridge round
     * trip per log line, which is the very thing batching exists to avoid.
     */
    pendingSize?(): number | undefined;
}
