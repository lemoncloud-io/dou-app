import { createLogId, createLogUploadQueue } from '@chatic/logger';
import type { LogEntry, LogPersistence, LogUploadQueue } from '@chatic/logger';

import type { ILogUploadQueueService, LogChargeResult } from './types';

/**
 * The app-side server-bound queue (ADR-0063), built on the same core
 * `createLogUploadQueue` the web uses — the level policy, the capacity drop
 * order and the id dedup are shared rather than reimplemented here.
 *
 * This class owns only the platform contact: when to persist, and turning the
 * bridge's id-shaped ack into the queue's entry-shaped remove.
 */
export class LogUploadQueueService implements ILogUploadQueueService {
    private readonly queue: LogUploadQueue = createLogUploadQueue();
    private restored = false;

    constructor(private readonly persistence: LogPersistence) {}

    public init(): void {
        if (this.restored) return;
        this.restored = true;
        try {
            this.queue.restore(this.persistence.load());
        } catch {
            /* a corrupt record must not stop the app from collecting anew */
        }
    }

    public charge(entries: LogEntry[]): LogChargeResult {
        if (!entries.length) return { accepted: 0, size: this.queue.size() };

        // Stamp anything that arrived without an id. An entry with no id can
        // never be acked, so it would be fetched, sent and fetched again
        // forever. Dispatch stamps ids on both sides today; this closes the
        // door on relayed entries from an older web build.
        const identified = entries.map(entry => (entry.id ? entry : { ...entry, id: createLogId() }));

        // Counted before the push so the answer means "newly queued", not "how
        // much the queue grew" — those differ once capacity eviction kicks in,
        // and the growth number would read as 0 on a full queue that did accept
        // the batch.
        const held = new Set(this.queue.snapshot().map(item => item.id));
        const accepted = identified.filter(entry => entry.level !== 'debug' && !held.has(entry.id)).length;

        this.queue.pushAll(identified);
        this.persistNow();

        return { accepted, size: this.queue.size() };
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

    /**
     * Persists synchronously after every mutation.
     *
     * No debounce here, unlike the ring buffer's persistence. The buffer can
     * afford to lose its last second — it is a diagnostic window. This queue
     * losing its last second means logs the server never receives, and the
     * writes are already batched by the charge/ack rhythm rather than happening
     * per entry.
     */
    private persistNow(): void {
        try {
            this.persistence.save(this.queue.snapshot());
        } catch {
            /* persistence failures must never break collection */
        }
    }
}
