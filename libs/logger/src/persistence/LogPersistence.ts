import type { LogEntry } from '../core/types';

/**
 * Port for persisting the in-memory log buffer across sessions. The core only
 * knows this contract; storage adapters (MMKV on native, sessionStorage on
 * web) live in the platform layers. (ADR-0047)
 */
export interface LogPersistence {
    /** Returns the previously persisted entries (empty array when none). */
    load(): LogEntry[];
    /** Persists the given snapshot, replacing the previous one. */
    save(entries: LogEntry[]): void;
}

export interface AttachLogPersistenceOptions {
    /** Debounce window for regular saves. */
    debounceMs?: number;
    /** Minimum interval between error-triggered immediate flushes. */
    errorFlushMinIntervalMs?: number;
    /**
     * When true, previously persisted entries are prepended into the buffer
     * on attach (native launch continuity). Web leaves this off — the
     * previous session's entries belong to its crash report, not to the new
     * session's breadcrumbs.
     */
    restore?: boolean;
}

export const DEFAULT_PERSIST_DEBOUNCE_MS = 1_000;
export const DEFAULT_ERROR_FLUSH_MIN_INTERVAL_MS = 100;
