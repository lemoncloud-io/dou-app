import type { LogEntry, LogLevel } from './types';

/**
 * The queue of entries not yet accepted by the server.
 *
 * This is NOT the ring buffer. The ring buffer is a window onto "what just
 * happened" — it may die with the tab and `peek` leaves it intact. This queue
 * exists to survive: nothing leaves it until the server answers 2xx
 * (at-least-once), so its owner persists it and its capacity is a hard limit
 * rather than a sliding window.
 *
 * Pure by design — persistence and scheduling live outside. The queue only
 * decides what is in it, what a batch contains, and what to drop under
 * pressure.
 */

/** Entries kept before backpressure starts dropping. */
export const DEFAULT_QUEUE_CAPACITY = 500;

export interface LogUploadQueueOptions {
    capacity?: number;
    /** Called when backpressure drops entries, so the owner can log one summary. */
    onDrop?: (dropped: LogEntry[]) => void;
}

export interface LogUploadQueue {
    /** Appends an entry, dropping under backpressure when over capacity. */
    push(entry: LogEntry): void;
    /** Appends many entries (bridge drain), applying the same policy once. */
    pushAll(entries: LogEntry[]): void;
    /**
     * Builds the next batch without removing anything — entries stay until
     * `ack` confirms the server took them.
     */
    nextBatch(limit: number): LogEntry[];
    /** Number of entries a batch would actually carry right now (see `isSendable`). */
    sendableSize(): number;
    /** Removes the given entries by id (2xx) or discards them outright (give-up). */
    remove(entries: LogEntry[]): void;
    /** Everything currently held, oldest first — for persistence snapshots. */
    snapshot(): LogEntry[];
    /** Replaces contents, e.g. restoring a persisted queue or adopting an orphan. */
    restore(entries: LogEntry[]): void;
    size(): number;
    /**
     * Slots left before backpressure starts dropping.
     *
     * A destructive producer (the native bridge `poll`) must ask before it
     * drains: entries it hands over beyond this are evicted here while already
     * being gone from its own buffer, which destroys them outright.
     */
    headroom(): number;
    clear(): void;
}

/**
 * Whether an entry would be uploaded in a batch that does (or does not)
 * contain an error.
 *
 * `debug` is the whole reason this is not just "everything queued": it is the
 * high-volume level and carries little value on its own, so it ships only as
 * context for a batch that has an error in it. It still sits in the queue
 * meanwhile — a later error must be able to pull it along.
 */
const isSendable = (entry: LogEntry, batchHasError: boolean): boolean => entry.level !== 'debug' || batchHasError;

const hasError = (entries: LogEntry[]): boolean => entries.some(entry => entry.level === 'error');

/** Drop order under backpressure: debug first, then oldest-first within a level. */
const DROP_PRIORITY: LogLevel[] = ['debug', 'info', 'warn', 'error'];

export const createLogUploadQueue = (options: LogUploadQueueOptions = {}): LogUploadQueue => {
    const capacity = options.capacity ?? DEFAULT_QUEUE_CAPACITY;
    let entries: LogEntry[] = [];

    const enforceCapacity = (): void => {
        if (entries.length <= capacity) return;

        const overflow = entries.length - capacity;
        const doomed = new Set<LogEntry>();

        // Walk levels cheapest-to-lose first; within a level the oldest go.
        for (const level of DROP_PRIORITY) {
            if (doomed.size >= overflow) break;
            for (const entry of entries) {
                if (doomed.size >= overflow) break;
                if (entry.level === level) doomed.add(entry);
            }
        }

        const dropped = entries.filter(entry => doomed.has(entry));
        entries = entries.filter(entry => !doomed.has(entry));

        // One summary per drop event — the queue's own failures must never
        // become a log storm of their own.
        if (dropped.length) options.onDrop?.(dropped);
    };

    return {
        push(entry) {
            entries.push(entry);
            enforceCapacity();
        },

        pushAll(incoming) {
            if (!incoming.length) return;

            // Drop ids already queued. In a hybrid run a web entry is queued
            // here AND relayed to the native buffer, which the uploader later
            // drains back in — the server upserts so storage is fine, but two
            // copies would halve the queue's effective capacity and evict
            // native-only entries that have no second copy.
            const queuedIds = new Set(entries.map(entry => entry.id).filter(Boolean));
            const fresh = incoming.filter(entry => !entry.id || !queuedIds.has(entry.id));
            if (!fresh.length) return;

            entries.push(...fresh);
            enforceCapacity();
        },

        nextBatch(limit) {
            if (limit <= 0 || !entries.length) return [];

            // The error test runs over the WHOLE queue, and the batch is filled
            // by scanning forward past entries that are not sendable yet.
            //
            // Deciding over a fixed positional window instead would starve the
            // pipeline: `debug` is the highest-volume level, so once `limit` of
            // them sit at the head with the error behind, every batch comes back
            // empty and nothing ships again until capacity eviction finally
            // moves them out. `sendableSize` already counts over the whole
            // queue, so this also keeps the size trigger and the batch it
            // triggers in agreement.
            const batchHasError = hasError(entries);
            const batch: LogEntry[] = [];

            for (const entry of entries) {
                if (batch.length >= limit) break;
                if (isSendable(entry, batchHasError)) batch.push(entry);
            }

            return batch;
        },

        sendableSize() {
            const batchHasError = hasError(entries);
            return entries.filter(entry => isSendable(entry, batchHasError)).length;
        },

        remove(sent) {
            if (!sent.length) return;
            const sentIds = new Set(sent.map(entry => entry.id));
            const withoutId = sent.filter(entry => !entry.id);

            entries = entries.filter(entry => {
                if (entry.id) return !sentIds.has(entry.id);
                // Entries without an id cannot be matched by key; fall back to
                // identity so a legacy relay is still removable.
                return !withoutId.includes(entry);
            });
        },

        snapshot: () => [...entries],

        restore(restored) {
            entries = [...restored];
            enforceCapacity();
        },

        size: () => entries.length,

        headroom: () => Math.max(0, capacity - entries.length),

        clear() {
            entries = [];
        },
    };
};
