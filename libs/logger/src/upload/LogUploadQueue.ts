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

/**
 * Bytes kept before backpressure starts dropping, on top of the count.
 *
 * Two axes because either alone leaves a hole. A count-only limit is cheap but
 * says nothing about size, so a handful of entries carrying large `data` can eat
 * far more than intended — and on the web that budget is shared with everything
 * else on the origin, so logs winning it breaks features that have nothing to do
 * with logging. A byte-only limit closes that but pays a serialization per push.
 * The count does the everyday work; this is the ceiling behind it.
 */
export const DEFAULT_QUEUE_MAX_BYTES = 512 * 1024;

export interface LogUploadQueueOptions {
    capacity?: number;
    maxBytes?: number;
    /**
     * Whether `debug` is kept.
     *
     * False in a release build, where nothing reads it: the console is not
     * running and Crashlytics discards it, so holding it would spend the store
     * on entries no one can ever see. True everywhere else, because that is
     * where someone *is* watching — and dropping the busiest level leaves the
     * diagnostic window missing exactly the trace being followed.
     *
     * The host decides, using the same flag that decides whether its console
     * runs, so the two cannot disagree about what "this build is being watched"
     * means.
     */
    acceptDebug?: boolean;
    /** Called when backpressure drops entries, so the owner can log one summary. */
    onDrop?: (dropped: LogEntry[]) => void;
}

/**
 * Drop order under backpressure: cheapest level first, oldest-first within a level.
 *
 * `debug` leads because it is the highest-volume level and the least valuable
 * per line. That ordering is what lets it be stored at all — without it a busy
 * minute of request logging would evict the `warn`/`error` lines the window
 * exists for, which is the failure the level policy used to avoid by keeping
 * `debug` out entirely.
 */
const DROP_PRIORITY: LogLevel[] = ['debug', 'info', 'warn', 'error'];

/** Charged to an entry that cannot be measured, so it still counts against the budget. */
const UNMEASURABLE_ENTRY_BYTES = 1024;

export class LogUploadQueue {
    private readonly capacity: number;
    private readonly maxBytes: number;
    private readonly acceptDebug: boolean;
    private readonly onDrop?: (dropped: LogEntry[]) => void;
    private entries: LogEntry[] = [];
    /**
     * Measured size per entry, so the byte total costs one serialization per
     * entry rather than one per check. Weak so a dropped entry's measurement
     * goes with it.
     */
    private readonly measured = new WeakMap<LogEntry, number>();

    constructor(options: LogUploadQueueOptions = {}) {
        this.capacity = options.capacity ?? DEFAULT_QUEUE_CAPACITY;
        this.maxBytes = options.maxBytes ?? DEFAULT_QUEUE_MAX_BYTES;
        this.acceptDebug = options.acceptDebug ?? false;
        this.onDrop = options.onDrop;
    }

    /** Appends an entry, dropping under backpressure when over capacity. */
    public push(entry: LogEntry): void {
        if (entry.level === 'debug' && !this.acceptDebug) return;

        this.entries.push(entry);
        this.enforceCapacity();
    }

    /** Appends many entries (bridge drain), applying the same policy once. */
    public pushAll(incoming: LogEntry[]): void {
        if (!incoming.length) return;

        const shippable = this.acceptDebug ? incoming : incoming.filter(entry => entry.level !== 'debug');
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
        // A release build discards any `debug` a previous (watched) build left
        // behind: nothing there can read it, and it would occupy the store.
        this.entries = this.acceptDebug ? restored : restored.filter(entry => entry.level !== 'debug');
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

    /**
     * Approximate serialized size of one entry, measured once and remembered.
     *
     * Approximate on purpose: this is a budget, not an accounting record, and
     * the exact on-disk figure depends on the owner's own encoding. A value that
     * cannot be stringified at all (a cycle the redactor did not flatten) is
     * charged a nominal amount rather than zero — charging zero would let such
     * entries accumulate unbounded, which is the opposite of what the axis is
     * for.
     */
    private sizeOf(entry: LogEntry): number {
        const cached = this.measured.get(entry);
        if (cached !== undefined) return cached;

        let size: number;
        try {
            size = JSON.stringify(entry)?.length ?? UNMEASURABLE_ENTRY_BYTES;
        } catch {
            size = UNMEASURABLE_ENTRY_BYTES;
        }

        this.measured.set(entry, size);
        return size;
    }

    private totalBytes(): number {
        return this.entries.reduce((sum, entry) => sum + this.sizeOf(entry), 0);
    }

    private enforceCapacity(): void {
        let bytes = this.totalBytes();
        if (this.entries.length <= this.capacity && bytes <= this.maxBytes) return;

        const overflow = this.entries.length - this.capacity;
        const doomed = new Set<LogEntry>();

        // Both axes have to come back under, so a pass stops only when the count
        // fits AND the bytes do. `over()` is re-read as entries are marked
        // because dropping one large entry can satisfy the byte axis on its own.
        const over = () => doomed.size < overflow || bytes > this.maxBytes;

        // Walk levels cheapest-to-lose first; within a level the oldest go.
        for (const level of DROP_PRIORITY) {
            if (!over()) break;
            for (const entry of this.entries) {
                if (!over()) break;
                if (entry.level !== level || doomed.has(entry)) continue;
                doomed.add(entry);
                bytes -= this.sizeOf(entry);
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
