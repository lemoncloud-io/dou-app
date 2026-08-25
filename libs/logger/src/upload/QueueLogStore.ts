import type { LogStore } from './LogStore';
import type { LogUploadQueue } from './LogUploadQueue';
import type { LogEntry } from '../core/types';

/**
 * Wraps an in-process queue as a `LogStore` — the web-standalone case, and the
 * app's own store on the native side.
 *
 * Every method here is a one-liner because the queue already has the semantics
 * the port asks for: `nextBatch` is non-destructive, `remove` is the release,
 * and capacity eviction lives inside `push`. The adapter exists to name those
 * operations the way the port does, not to add behaviour.
 */
export class QueueLogStore implements LogStore {
    constructor(private readonly queue: LogUploadQueue) {}

    public push(entry: LogEntry): void {
        this.queue.push(entry);
    }

    public async peek(limit: number): Promise<LogEntry[]> {
        return this.queue.nextBatch(limit);
    }

    public async ack(entries: LogEntry[]): Promise<void> {
        this.queue.remove(entries);
    }

    public async clear(): Promise<void> {
        this.queue.clear();
    }

    public size(): number {
        return this.queue.size();
    }
}

/** Convenience factory, kept for call sites that read better without `new`. */
export const createQueueLogStore = (queue: LogUploadQueue): LogStore => new QueueLogStore(queue);
