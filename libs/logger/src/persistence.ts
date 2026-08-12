import { logBuffer, logHub } from './logger';
import type { LogEntry } from './types';

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

/**
 * Wires a LogPersistence adapter to the global log stream: saves a buffer
 * snapshot debounced on every entry, flushing immediately (rate-limited) on
 * error-level entries so a crash right after an error loses as little tail
 * as possible. Returns a teardown that flushes pending writes and
 * unsubscribes.
 */
export const attachLogPersistence = (
    persistence: LogPersistence,
    options: AttachLogPersistenceOptions = {}
): (() => void) => {
    const debounceMs = options.debounceMs ?? DEFAULT_PERSIST_DEBOUNCE_MS;
    const minErrorInterval = options.errorFlushMinIntervalMs ?? DEFAULT_ERROR_FLUSH_MIN_INTERVAL_MS;

    if (options.restore) {
        // A corrupt store must never block logging — start fresh instead.
        try {
            logBuffer.load(persistence.load());
        } catch {
            /* noop */
        }
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastErrorFlush = 0;

    const flush = (): void => {
        if (timer !== undefined) {
            clearTimeout(timer);
            timer = undefined;
        }
        // Persistence failures must never break the logging pipeline.
        try {
            persistence.save(logBuffer.peek());
        } catch {
            /* noop */
        }
    };

    const listener = (entry: LogEntry): void => {
        if (entry.level === 'error') {
            const now = Date.now();
            // Rate-limit immediate flushes so an error storm cannot turn every
            // entry into a synchronous storage write.
            if (now - lastErrorFlush >= minErrorInterval) {
                lastErrorFlush = now;
                flush();
                return;
            }
        }
        if (timer === undefined) {
            timer = setTimeout(flush, debounceMs);
        }
    };

    const unsubscribe = logHub.subscribe(listener);

    return () => {
        unsubscribe();
        flush();
    };
};
