import { APP_STAT_QUEUE_CAPACITY, APP_STAT_QUEUE_MAX_BYTES, createLogUploadQueue, logHub } from '@chatic/logger';
import type { LogEntry, LogUploadQueue } from '@chatic/logger';

import type { ILogUploadQueueService, LogUploadQueuePersistence } from './types';

const COLLECT_PERSIST_DEBOUNCE_MS = 1_000;

export class LogUploadQueueService implements ILogUploadQueueService {
    private readonly queue: LogUploadQueue;
    private restored = false;
    private unsubscribe?: () => void;
    private persistTimer?: ReturnType<typeof setTimeout>;
    private lastLogAt?: number;
    private previousRunLastLogAt?: number;

    constructor(
        private readonly persistence: LogUploadQueuePersistence,
        keepDebug = false
    ) {
        this.queue = createLogUploadQueue({
            acceptDebug: keepDebug,
            statCapacity: APP_STAT_QUEUE_CAPACITY,
            statMaxBytes: APP_STAT_QUEUE_MAX_BYTES,
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

    private recordLastLogAt(entry: LogEntry): void {
        if (!entry.timestamp) return;
        if (this.lastLogAt === undefined || entry.timestamp > this.lastLogAt) {
            this.lastLogAt = entry.timestamp;
        }
    }

    private collect(entry: LogEntry): void {
        this.queue.push(entry);
        this.recordLastLogAt(entry);
        this.persistSoon();
    }

    private persistSoon(): void {
        if (this.persistTimer !== undefined) return;
        this.persistTimer = setTimeout(() => this.persistNow(), COLLECT_PERSIST_DEBOUNCE_MS);
    }

    private persistNow(): void {
        if (this.persistTimer !== undefined) {
            clearTimeout(this.persistTimer);
            this.persistTimer = undefined;
        }
        try {
            this.persistence.save(this.queue.snapshot());
            if (this.lastLogAt !== undefined) this.persistence.saveLastLogAt(this.lastLogAt);
        } catch {
            /* persistence failures must never break collection */
        }
    }
}
