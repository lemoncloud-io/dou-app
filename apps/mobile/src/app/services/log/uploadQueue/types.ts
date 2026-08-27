import type { LogEntry } from '@chatic/logger';

/**
 * What the queue needs from a store.
 *
 * Declared here rather than reusing the core's retired `LogPersistence` port:
 * that one existed for the ring buffer, and this store has one thing the
 * buffer's never did — a `lastLogAt` high-water mark that has to survive the
 * entries being acked away.
 */
export interface LogUploadQueuePersistence {
    load(): LogEntry[];
    save(entries: LogEntry[]): void;
    /** The newest log timestamp seen, or undefined if nothing was ever recorded. */
    loadLastLogAt(): number | undefined;
    saveLastLogAt(timestamp: number): void;
}

/**
 * The app's server-bound log queue (ADR-0063).
 *
 * The only log store on the device. It holds "what has not reached the server
 * yet": non-debug only, persisted because that is its whole reason to exist, and
 * nothing leaves it before `ack`. The second store this used to sit beside — a
 * merged ring buffer holding every level as a diagnostic window — is gone;
 * "what just happened" is now read straight off the hub by its subscribers.
 */
export interface ILogUploadQueueService {
    /**
     * Restores the persisted queue and starts collecting natively dispatched
     * entries — idempotent. Must run before anything logs (principle 15).
     */
    init(): void;

    /** Stops collecting. The queue itself is untouched. */
    teardown(): void;

    /**
     * Up to `limit` entries, oldest first, WITHOUT removing them. Handing back
     * the same entries on a later call is correct — only `ack` releases them.
     */
    fetch(limit?: number): LogEntry[];

    /** Releases the given ids; returns the remaining size. */
    ack(ids: string[]): number;

    /** Empties the queue (device opt-out). Returns the size after, i.e. 0. */
    clear(): number;

    getSize(): number;
    /** Entries backpressure has evicted this run, cumulative. */
    getDroppedCount(): number;

    /**
     * The last log timestamp of the run BEFORE this one, as restored at `init`.
     *
     * Crash detection's only clock: a process killed by a signal leaves no
     * timestamp of its own, so the last thing it managed to log is the closest
     * approximation of when it died. Frozen at boot rather than live, or this
     * run's own entries would push the answer past the crash. Undefined when
     * nothing was ever recorded — the caller decides what to do about that.
     */
    getPreviousRunLastLogAt(): number | undefined;
}
