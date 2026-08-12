import { attachLogPersistence, logBuffer } from '@chatic/logger';
import type { LogEntry, LogPersistence } from '@chatic/logger';
import { serializeError, serializeLogValue } from '../utils';
import type { ILogBufferService } from './types';

/**
 * Makes an entry safe to cross the JSON bridge / persist: circular data and
 * Error instances are flattened before `JSON.stringify` ever sees them.
 */
const toBridgeSafe = (entry: LogEntry): LogEntry => ({
    ...entry,
    data: serializeLogValue(entry.data),
    error: entry.error != null ? serializeError(entry.error) : undefined,
});

/**
 * Facade over the core log buffer — the single merged native+web buffer
 * (ADR-0047) — wiring MMKV-backed persistence to it. The pre-ADR-0047
 * standalone queue is gone: the core buffer captures every dispatched entry
 * itself (including ones emitted before wiring), so this service only
 * attaches persistence and adapts entries into bridge-safe shapes.
 */
export class LogBufferService implements ILogBufferService {
    private teardownPersistence?: () => void;

    constructor(private readonly persistence: LogPersistence) {}

    public init(): void {
        if (this.teardownPersistence) return;
        this.teardownPersistence = attachLogPersistence(this.persistence, { restore: true });
    }

    public teardown(): void {
        this.teardownPersistence?.();
        this.teardownPersistence = undefined;
    }

    public getSize(): number {
        return logBuffer.size();
    }

    public peek(count?: number): LogEntry[] {
        return logBuffer.peek(count).map(toBridgeSafe);
    }

    public async poll(count?: number): Promise<LogEntry[]> {
        const entries = logBuffer.poll(count).map(toBridgeSafe);
        this.persistNow();
        return entries;
    }

    public async clear(): Promise<void> {
        logBuffer.clear();
        this.persistNow();
    }

    /** Consuming operations persist immediately so a relaunch cannot resurrect drained entries. */
    private persistNow(): void {
        try {
            this.persistence.save(logBuffer.peek());
        } catch {
            /* persistence failures must never break the buffer */
        }
    }
}
