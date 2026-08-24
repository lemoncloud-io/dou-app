import { attachLogPersistence, logBuffer, safeSerializable } from '@chatic/logger';
import type { LogEntry, LogPersistence } from '@chatic/logger';
import type { ILogBufferService } from './types';

/**
 * Makes an entry safe to cross the JSON bridge / persist: circular data and
 * Error instances are flattened before `JSON.stringify` ever sees them.
 *
 * `safeSerializable` is the shared core serializer, not a local one. The local
 * pair it replaced spread `...error` for an axios error, widening the payload to
 * include `config` — auth headers and the request body — at the exact moment it
 * crossed the bridge. Downstream key-based masking caught it, but a serializer
 * whose job is to narrow must not widen.
 *
 * Plain `data` is still passed through structurally and masked at the boundary
 * that stores or sends it (`serializeLogs` here, `toWireLogEntry` on the wire).
 * That is the documented split — the merged buffer is a debug-UI source and
 * wants the structure.
 */
const toBridgeSafe = (entry: LogEntry): LogEntry => ({
    ...entry,
    data: safeSerializable(entry.data),
    error: safeSerializable(entry.error),
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
