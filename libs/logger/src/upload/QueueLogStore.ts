import type { LogStore } from './LogStore';
import type { LogUploadQueue } from './LogUploadQueue';
import type { LogEntry } from '../core/types';

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

export const createQueueLogStore = (queue: LogUploadQueue): LogStore => new QueueLogStore(queue);
