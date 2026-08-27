import { createLogUploadQueue, logHub, noteQueueDrops } from '@chatic/logger';
import type { LogEntry, LogUploadQueue } from '@chatic/logger';

import type { ILogUploadQueueService, LogUploadQueuePersistence } from './types';

/**
 * Debounce for the per-entry collection path. Matches the web uploader's own
 * queue-write debounce so both sides lose the same worst case.
 */
const COLLECT_PERSIST_DEBOUNCE_MS = 1_000;

/**
 * The app-side server-bound queue (ADR-0063), built on the same core
 * `createLogUploadQueue` the web uses — the level policy, the capacity drop
 * order and the id dedup are shared rather than reimplemented here.
 *
 * This class owns only the platform contact: when to persist, turning the
 * bridge's id-shaped ack into the queue's entry-shaped remove, and collecting
 * what the app itself dispatches.
 */
export class LogUploadQueueService implements ILogUploadQueueService {
    private readonly queue: LogUploadQueue;
    private restored = false;
    private unsubscribe?: () => void;
    private persistTimer?: ReturnType<typeof setTimeout>;
    /**
     * Newest log timestamp seen this run, monotonic.
     *
     * Never derived from the queue's contents: `ack` removes what shipped, so on
     * a healthy device the queue is empty most of the time and its last entry is
     * not the last thing that happened. Kept as its own high-water mark so it
     * only ever moves forward.
     */
    private lastLogAt?: number;
    /**
     * What the store held at boot — i.e. the previous run's last log.
     *
     * Frozen on purpose. It is read by crash detection, which asks "when did the
     * run that died stop logging"; letting this run's own entries advance it
     * would answer with a time after the crash.
     */
    private previousRunLastLogAt?: number;

    /**
     * `keepDebug` should be the same flag that gates the console subscription
     * and the web's `debug` relay — one notion of "this build is being
     * watched", so the three cannot drift apart. Injected rather than read from
     * `__DEV__` here so the service stays constructible in a test.
     */
    constructor(
        private readonly persistence: LogUploadQueuePersistence,
        keepDebug = false
    ) {
        this.queue = createLogUploadQueue({
            acceptDebug: keepDebug,
            // Backpressure loss is not random — a device that logs enough to fill
            // this queue is generally a slow one, so the samples that make the p95
            // are the first to go. Counting them lets the distribution be read
            // with that in mind (ADR-0071). Nothing but the count may happen here:
            // this runs inside a hub publish, where a `logger` call re-enters.
            onDrop: dropped => noteQueueDrops(dropped.length),
        });
    }

    public init(): void {
        if (this.restored) return;
        this.restored = true;
        try {
            this.queue.restore(this.persistence.load());
            this.previousRunLastLogAt = this.persistence.loadLastLogAt();
        } catch {
            /* a corrupt record must not stop the app from collecting anew */
        }

        // The hub is where every origin surfaces — native (Kotlin/Swift), RN, and
        // web entries relayed in one at a time — so this one subscription is the
        // whole of collection. There is no second door: the batched `charge` that
        // used to write straight into the queue is gone, and with it the reason
        // this listener had to tell web entries apart.
        this.unsubscribe = logHub.subscribe(entry => this.collect(entry));
    }

    public teardown(): void {
        this.unsubscribe?.();
        this.unsubscribe = undefined;
        this.persistNow();
    }

    public fetch(limit?: number): LogEntry[] {
        return this.queue.nextBatch(limit ?? this.queue.size());
    }

    public ack(ids: string[]): number {
        if (ids.length) {
            const doomed = new Set(ids);
            this.queue.remove(this.queue.snapshot().filter(entry => entry.id && doomed.has(entry.id)));
            this.persistNow();
        }
        return this.queue.size();
    }

    public clear(): number {
        this.queue.clear();
        this.persistNow();
        return this.queue.size();
    }

    public getSize(): number {
        return this.queue.size();
    }

    public getPreviousRunLastLogAt(): number | undefined {
        return this.previousRunLastLogAt;
    }

    /** Advances the high-water mark. Never moves it backwards. */
    private recordLastLogAt(entry: LogEntry): void {
        if (!entry.timestamp) return;
        if (this.lastLogAt === undefined || entry.timestamp > this.lastLogAt) {
            this.lastLogAt = entry.timestamp;
        }
    }

    /**
     * Takes every entry the hub publishes, whatever its origin.
     *
     * This used to skip `source: 'web'`. Web entries arrived twice back then —
     * once published on this hub by the bridge handler, once written straight
     * into the queue by `charge` — and the filter picked which copy counted.
     * With the batched path gone there is one arrival, so a web entry is stored
     * exactly like a native one and `source` goes back to being a label rather
     * than a routing decision.
     */
    private collect(entry: LogEntry): void {
        // Nothing in here may log: this runs inside a hub publish, so a `logger`
        // call would re-enter and recurse (principle 8). The queue swallows its
        // own failures and `persistSoon` cannot throw.
        this.queue.push(entry);
        // Debug entries reach here even though the queue drops them, and they
        // still move the mark — a run's last line is its last line regardless of
        // level, and boot/lifecycle logging is mostly debug.
        this.recordLastLogAt(entry);
        this.persistSoon();
    }

    /**
     * Debounced persistence, for the per-entry path only.
     *
     * Collection is the only path in now, and it arrives once per log line —
     * `save` re-serializes the whole queue, so writing synchronously here would
     * put an O(queue) MMKV write on every `logger.*` call the app makes.
     *
     * The window costs the last second of natively dispatched entries in a hard
     * crash — the same trade the web queue already makes, and the crash itself is
     * Crashlytics' job rather than this queue's.
     */
    private persistSoon(): void {
        if (this.persistTimer !== undefined) return;
        this.persistTimer = setTimeout(() => this.persistNow(), COLLECT_PERSIST_DEBOUNCE_MS);
    }

    /**
     * Persists synchronously after every mutation.
     *
     * No debounce here, unlike the ring buffer's persistence used to have. A
     * diagnostic window can afford to lose its last second; this store losing
     * its last second means logs the server never receives. The callers are
     * `ack` and teardown, which arrive on the upload rhythm rather than per
     * entry, so there is nothing to batch.
     */
    private persistNow(): void {
        if (this.persistTimer !== undefined) {
            clearTimeout(this.persistTimer);
            this.persistTimer = undefined;
        }
        try {
            this.persistence.save(this.queue.snapshot());
            // Rides the queue's rhythm rather than getting a cadence of its own:
            // a write per log line would be an MMKV round trip per `logger.*`
            // call, for a value only the next boot reads.
            if (this.lastLogAt !== undefined) this.persistence.saveLastLogAt(this.lastLogAt);
        } catch {
            /* persistence failures must never break collection */
        }
    }
}
