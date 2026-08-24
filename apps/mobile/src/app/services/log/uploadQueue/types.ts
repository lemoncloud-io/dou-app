import type { LogEntry } from '@chatic/logger';

/** Result of a batch charge — what landed, and how full the queue is now. */
export interface LogChargeResult {
    /** Entries that were shippable and not already held (debug and dupes excluded). */
    accepted: number;
    /** Queue size after the charge — the web reads this as its upload size trigger. */
    size: number;
}

/**
 * The app's server-bound log queue (ADR-0063).
 *
 * Deliberately NOT the merged ring buffer. The buffer is a window on "what just
 * happened" — every level, read with `peek`, free to die with the process. This
 * is "what has not reached the server yet": non-debug only, persisted because
 * that is its whole reason to exist, and nothing leaves it before `ack`.
 *
 * Keeping them in one place is what broke breadcrumbs before — the upload path
 * consumed the buffer reports read from.
 */
export interface ILogUploadQueueService {
    /** Restores the persisted queue — idempotent. Must run before the first charge. */
    init(): void;

    /**
     * Takes a batch relayed from the web, or entries dispatched natively.
     * Debug is dropped at the door and ids already held are ignored, so a
     * re-sent charge (a lost response, say) cannot duplicate anything.
     */
    charge(entries: LogEntry[]): LogChargeResult;

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
}
