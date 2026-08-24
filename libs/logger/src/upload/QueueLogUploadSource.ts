import type { LogUploadSource } from './LogUploadSource';
import type { LogUploadQueue } from './LogUploadQueue';
import type { LogEntry } from '../core/types';

/**
 * Wraps an in-process queue as a source — the web-standalone case, and the
 * fallback whenever the native shell cannot serve one (older app build, bridge
 * failure).
 *
 * `fetch` is non-destructive because `nextBatch` is: the queue keeps everything
 * until `remove`, which is exactly the port's contract.
 */
export class QueueLogUploadSource implements LogUploadSource {
    constructor(private readonly queue: LogUploadQueue) {}

    public async fetch(limit: number): Promise<LogEntry[]> {
        return this.queue.nextBatch(limit);
    }

    public async ack(entries: LogEntry[]): Promise<void> {
        this.queue.remove(entries);
    }

    public pendingSize(): number | undefined {
        return this.queue.sendableSize();
    }
}

/** Convenience factory, kept for call sites that read better without `new`. */
export const createQueueUploadSource = (queue: LogUploadQueue): LogUploadSource => new QueueLogUploadSource(queue);
