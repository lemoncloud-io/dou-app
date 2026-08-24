import type { LogEntry, LogLevel } from '../core/types';

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

/** Drop order under backpressure: cheapest level first, oldest-first within a level. */
const DROP_PRIORITY: LogLevel[] = ['info', 'warn', 'error'];

export class LogUploadQueue {
    private readonly capacity: number;
    private readonly onDrop?: (dropped: LogEntry[]) => void;
    private entries: LogEntry[] = [];

    constructor(options: LogUploadQueueOptions = {}) {
        this.capacity = options.capacity ?? DEFAULT_QUEUE_CAPACITY;
        this.onDrop = options.onDrop;
    }

    /** Appends an entry, dropping under backpressure when over capacity. */
    public push(entry: LogEntry): void {
        // debug is the highest-volume level and carries little value on its
        // own, so it never enters the server-bound queue at all.
        if (entry.level === 'debug') return;

        this.entries.push(entry);
        this.enforceCapacity();
    }

    /** Appends many entries (bridge drain), applying the same policy once. */
    public pushAll(incoming: LogEntry[]): void {
        if (!incoming.length) return;

        const shippable = incoming.filter(entry => entry.level !== 'debug');
        if (!shippable.length) return;

        // Drop ids already queued. In a hybrid run a web entry is queued
        // here AND relayed to the native buffer, which the uploader later
        // drains back in — the server upserts so storage is fine, but two
        // copies would halve the queue's effective capacity and evict
        // native-only entries that have no second copy.
        const queuedIds = new Set(this.entries.map(entry => entry.id).filter(Boolean));
        const fresh = shippable.filter(entry => !entry.id || !queuedIds.has(entry.id));
        if (!fresh.length) return;

        this.entries.push(...fresh);
        this.enforceCapacity();
    }

    /**
     * Builds the next batch without removing anything — entries stay until
     * `ack` confirms the server took them.
     */
    public nextBatch(limit: number): LogEntry[] {
        if (limit <= 0 || !this.entries.length) return [];
        return this.entries.slice(0, limit);
    }

    /** Number of entries a batch would actually carry right now. */
    public sendableSize(): number {
        return this.entries.length;
    }

    /** Removes the given entries by id (2xx) or discards them outright (give-up). */
    public remove(sent: LogEntry[]): void {
        if (!sent.length) return;

        const sentIds = new Set(sent.map(entry => entry.id));
        const withoutId = sent.filter(entry => !entry.id);

        this.entries = this.entries.filter(entry => {
            if (entry.id) return !sentIds.has(entry.id);
            // Entries without an id cannot be matched by key; fall back to
            // identity so a legacy relay is still removable.
            return !withoutId.includes(entry);
        });
    }

    /** Everything currently held, oldest first — for persistence snapshots. */
    public snapshot(): LogEntry[] {
        return [...this.entries];
    }

    /** Replaces contents, e.g. restoring a persisted queue or adopting an orphan. */
    public restore(restored: LogEntry[]): void {
        // A snapshot persisted by an older build may still hold debug
        // entries from before they stopped being queued.
        this.entries = restored.filter(entry => entry.level !== 'debug');
        this.enforceCapacity();
    }

    public size(): number {
        return this.entries.length;
    }

    /**
     * Slots left before backpressure starts dropping.
     *
     * A destructive producer (the native bridge `poll`) must ask before it
     * drains: entries it hands over beyond this are evicted here while already
     * being gone from its own buffer, which destroys them outright.
     */
    public headroom(): number {
        return Math.max(0, this.capacity - this.entries.length);
    }

    public clear(): void {
        this.entries = [];
    }

    private enforceCapacity(): void {
        if (this.entries.length <= this.capacity) return;

        const overflow = this.entries.length - this.capacity;
        const doomed = new Set<LogEntry>();

        // Walk levels cheapest-to-lose first; within a level the oldest go.
        for (const level of DROP_PRIORITY) {
            if (doomed.size >= overflow) break;
            for (const entry of this.entries) {
                if (doomed.size >= overflow) break;
                if (entry.level === level) doomed.add(entry);
            }
        }

        const dropped = this.entries.filter(entry => doomed.has(entry));
        this.entries = this.entries.filter(entry => !doomed.has(entry));

        // One summary per drop event — the queue's own failures must never
        // become a log storm of their own.
        if (dropped.length) this.onDrop?.(dropped);
    }
}

/** Convenience factory, kept for call sites that read better without `new`. */
export const createLogUploadQueue = (options: LogUploadQueueOptions = {}): LogUploadQueue =>
    new LogUploadQueue(options);
