import type { LogEntry } from '@chatic/logger';

export interface ILogBufferService {
    /** Starts persistence, restoring the previous session's tail — idempotent. */
    init(): void;
    /** Stops persistence (flushing pending writes). */
    teardown(): void;
    /** Number of entries currently buffered. */
    getSize(): number;
    /** Reads up to `count` oldest entries without removing them. */
    peek(count?: number): LogEntry[];
    /** Removes and returns up to `count` oldest entries, persisting the rest. */
    poll(count?: number): Promise<LogEntry[]>;
    /** Empties the buffer and persists the empty state. */
    clear(): Promise<void>;
}
