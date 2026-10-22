import { isTelemetryEntry } from '../core/kind';
import { createLogId } from '../core/logId';

import type { LogEntry, LogLevel, TelemetryKind } from '../core/types';

/**
 * The queue of entries not yet accepted by the server, and the package's only
 * store.
 *
 * It exists to survive: nothing leaves it until the server answers 2xx
 * (at-least-once), so its owner persists it and its capacity is a hard limit
 * rather than a sliding window. The diagnostic window a reader wants is the
 * same rows — holding the send is what turns the queue into one — which is why
 * there is no second store to keep in step with this one.
 *
 * Pure by design — persistence and scheduling live outside. The queue only
 * decides what is in it, what a batch contains, and what to drop under
 * pressure.
 *
 * **One queue, two shares.** Statistics (`trace` · `sample` · `event`) ride the same queue as logs,
 * but each kind of record is capped inside its own share and evicted only by its own kind. Left to
 * one shared budget, the devices that log the most — the slow ones — would lose their measurements
 * first, and every percentile would read better than the truth; the other way round, a burst of
 * measurements would push out the `warn`/`error` lines the queue exists to keep. The log share keeps
 * exactly the ceilings and drop order it always had. Shares are arithmetic over the one array:
 * storage, batching and order are unchanged, and a batch mixes both kinds oldest first.
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

/**
 * The statistics share — its own ceilings, never charged against the log share above.
 *
 * The web default. The app keeps a smaller one ({@link APP_STAT_QUEUE_CAPACITY}) because MMKV holds
 * its queue in memory as one value. Both are design values still to be measured against real runs.
 */
export const DEFAULT_STAT_QUEUE_CAPACITY = 500;
export const DEFAULT_STAT_QUEUE_MAX_BYTES = 256 * 1024;
/** The statistics share in the mobile app's queue. */
export const APP_STAT_QUEUE_CAPACITY = 300;
export const APP_STAT_QUEUE_MAX_BYTES = 160 * 1024;

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
    /** Called when backpressure drops log entries, so the owner can log one summary. */
    onDrop?: (dropped: LogEntry[]) => void;
    /** Entries kept in the statistics share before it starts dropping. */
    statCapacity?: number;
    /** Bytes kept in the statistics share before it starts dropping. */
    statMaxBytes?: number;
    /**
     * Called when the statistics share drops entries. Separate from `onDrop` because the owner's
     * answer differs: a lost log becomes one summary log line, a lost statistic becomes a count on
     * the next `telemetry_dropped` sample — writing it as a log would spend the other share on it.
     */
    onStatDrop?: (dropped: LogEntry[]) => void;
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

/**
 * Drop order inside the statistics share: `sample` first, then `trace`, then `event`, oldest first
 * within a kind. Samples arrive in the largest numbers and each one matters least; events are what
 * usage counts are built from, and losing one undercounts with nothing to correct it.
 */
const STAT_DROP_PRIORITY: TelemetryKind[] = ['sample', 'trace', 'event'];

/** Unknown kinds (a newer runtime's) are dropped first, rather than escaping the ceiling. */
const statRank = (entry: LogEntry): TelemetryKind =>
    STAT_DROP_PRIORITY.includes(entry.kind as TelemetryKind) ? (entry.kind as TelemetryKind) : 'sample';

/** Charged to an entry that cannot be measured, so it still counts against the budget. */
const UNMEASURABLE_ENTRY_BYTES = 1024;

export class LogUploadQueue {
    private readonly capacity: number;
    private readonly maxBytes: number;
    private readonly acceptDebug: boolean;
    private readonly onDrop?: (dropped: LogEntry[]) => void;
    private readonly statCapacity: number;
    private readonly statMaxBytes: number;
    private readonly onStatDrop?: (dropped: LogEntry[]) => void;
    private entries: LogEntry[] = [];
    /**
     * Entries this queue has evicted under backpressure, cumulative for the run.
     *
     * The queue counts its own losses because nothing else can: the drop happens
     * inside `push`, which runs inside a hub publish, and the upload path may not
     * log at all (principles 8 and 11) — so a drop cannot become a log entry of
     * its own. A reader elsewhere picks the number up and carries it out on
     * something that IS written (today a performance metric, ADR-0071).
     *
     * Never reset. A running total is what lets a reader that arrives late, or
     * whose own entry gets dropped, still report the truth.
     *
     * Log share only, as it always was; the statistics share counts its own below.
     */
    private droppedEntries = 0;
    /** Entries the statistics share has evicted, cumulative for the run. Never reset, for the same reason. */
    private droppedStatEntries = 0;
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
        this.statCapacity = options.statCapacity ?? DEFAULT_STAT_QUEUE_CAPACITY;
        this.statMaxBytes = options.statMaxBytes ?? DEFAULT_STAT_QUEUE_MAX_BYTES;
        this.onStatDrop = options.onStatDrop;
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

    /**
     * Replaces contents, e.g. restoring a persisted queue or adopting an orphan.
     *
     * **An id-less entry is given one here.** `id` is both the server's dedup key and the key the
     * host acks by, so an entry without one can be uploaded but never removed: it ships again on
     * every cycle and the server stores a fresh document each time. Records written by a build whose
     * persistence dropped the field are exactly that case, and they are already on devices — so
     * they are repaired on the way in rather than left to loop.
     *
     * Minting rather than discarding, for the same reason `CoreLogger.ingest` backfills a relayed
     * entry's id: the entry is real and the only thing missing is a key. A fresh id can let one
     * already-uploaded entry through a second time, which is the strictly better failure — the
     * alternative is an entry that can never leave.
     */
    public restore(restored: LogEntry[]): void {
        // A release build discards any `debug` a previous (watched) build left
        // behind: nothing there can read it, and it would occupy the store.
        const kept = this.acceptDebug ? restored : restored.filter(entry => entry.level !== 'debug');
        this.entries = kept.map(entry => (entry.id ? entry : { ...entry, id: createLogId() }));
        this.enforceCapacity();
    }

    public size(): number {
        return this.entries.length;
    }

    /** Statistics entries held right now. */
    public statSize(): number {
        return this.entries.filter(isTelemetryEntry).length;
    }

    /** Log entries lost to backpressure so far this run. */
    public droppedCount(): number {
        return this.droppedEntries;
    }

    /** Statistics entries lost to backpressure so far this run. */
    public droppedStatCount(): number {
        return this.droppedStatEntries;
    }

    /**
     * Slots left in the log share before backpressure starts dropping.
     *
     * A destructive producer (the native bridge `poll`) must ask before it
     * drains: entries it hands over beyond this are evicted here while already
     * being gone from its own buffer, which destroys them outright.
     *
     * The log share's, because that is what such a producer has always handed over; statistics
     * held here do not use up its room.
     */
    public headroom(): number {
        return Math.max(0, this.capacity - (this.entries.length - this.statSize()));
    }

    /** Slots left in the statistics share. */
    public statHeadroom(): number {
        return Math.max(0, this.statCapacity - this.statSize());
    }

    public clear(): void {
        this.entries = [];
    }

    /**
     * Discards every statistics entry and leaves the logs alone — the statistics kill switch. Not
     * counted as a drop: nothing was squeezed out, the policy withdrew them.
     */
    public clearStats(): void {
        this.entries = this.entries.filter(entry => !isTelemetryEntry(entry));
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

    private bytesOf(members: LogEntry[]): number {
        return members.reduce((sum, entry) => sum + this.sizeOf(entry), 0);
    }

    /**
     * Marks what one share must lose to fit both of its ceilings.
     *
     * Each share runs this over its own members only, which is the whole guarantee that neither
     * share evicts the other. For the log share it is the same walk the queue has always made.
     */
    private overflowOf<K>(
        members: LogEntry[],
        capacity: number,
        maxBytes: number,
        order: K[],
        rank: (entry: LogEntry) => K | undefined
    ): Set<LogEntry> {
        const doomed = new Set<LogEntry>();
        let bytes = this.bytesOf(members);
        if (members.length <= capacity && bytes <= maxBytes) return doomed;

        const overflow = members.length - capacity;

        // Both axes have to come back under, so a pass stops only when the count
        // fits AND the bytes do. `over()` is re-read as entries are marked
        // because dropping one large entry can satisfy the byte axis on its own.
        const over = () => doomed.size < overflow || bytes > maxBytes;

        // Walk the ranks cheapest-to-lose first; within a rank the oldest go.
        for (const key of order) {
            if (!over()) break;
            for (const entry of members) {
                if (!over()) break;
                if (rank(entry) !== key || doomed.has(entry)) continue;
                doomed.add(entry);
                bytes -= this.sizeOf(entry);
            }
        }

        return doomed;
    }

    private enforceCapacity(): void {
        const logs: LogEntry[] = [];
        const stats: LogEntry[] = [];
        for (const entry of this.entries) (isTelemetryEntry(entry) ? stats : logs).push(entry);

        const doomedLogs = this.overflowOf(logs, this.capacity, this.maxBytes, DROP_PRIORITY, entry => entry.level);
        const doomedStats = this.overflowOf(stats, this.statCapacity, this.statMaxBytes, STAT_DROP_PRIORITY, statRank);
        if (!doomedLogs.size && !doomedStats.size) return;

        const droppedLogs = logs.filter(entry => doomedLogs.has(entry));
        const droppedStats = stats.filter(entry => doomedStats.has(entry));
        this.entries = this.entries.filter(entry => !doomedLogs.has(entry) && !doomedStats.has(entry));

        this.droppedEntries += droppedLogs.length;
        this.droppedStatEntries += droppedStats.length;

        // One summary per drop event — the queue's own failures must never
        // become a log storm of their own.
        if (droppedLogs.length) this.onDrop?.(droppedLogs);
        if (droppedStats.length) this.onStatDrop?.(droppedStats);
    }
}

/** Convenience factory, kept for call sites that read better without `new`. */
export const createLogUploadQueue = (options: LogUploadQueueOptions = {}): LogUploadQueue =>
    new LogUploadQueue(options);
