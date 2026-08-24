import { RingBuffer } from './RingBuffer';

import type { LogEntry } from './types';

/**
 * In-memory window over the most recent log entries.
 *
 * Follows the mobile LogBufferService semantics (peek keeps, poll consumes) so
 * the debug UI can use the same interaction model against either buffer. The
 * ring buffer underneath is generic; this class is what makes it log-shaped —
 * and it is the only place that knows restored entries are older than whatever
 * the current run has already captured.
 */
export class LogBuffer {
    private readonly buffer: RingBuffer<LogEntry>;

    constructor(capacity: number) {
        this.buffer = new RingBuffer<LogEntry>(capacity);
    }

    /** Appends an entry, evicting the oldest one once capacity is reached. */
    public push(entry: LogEntry): void {
        this.buffer.push(entry);
    }

    /** Reads the newest entries without consuming them. */
    public peek(count?: number): LogEntry[] {
        return this.buffer.peek(count);
    }

    /** Reads and removes entries — the destructive counterpart of `peek`. */
    public poll(count?: number): LogEntry[] {
        return this.buffer.shift(count);
    }

    public clear(): void {
        this.buffer.clear();
    }

    public size(): number {
        return this.buffer.size();
    }

    /**
     * Prepends restored entries (from a LogPersistence adapter) AHEAD of
     * anything already captured during boot, keeping chronological order —
     * restored entries are by definition older than the current session's.
     */
    public load(entries: LogEntry[]): void {
        if (!entries.length) return;

        const current = this.buffer.shift();
        [...entries, ...current].forEach(item => this.buffer.push(item));
    }
}
