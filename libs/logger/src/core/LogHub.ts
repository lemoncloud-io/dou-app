import type { LogEntry, LogListener } from './types';

/**
 * Minimal pub/sub hub for log entries. Mirrors the mobile LogService
 * subscription pattern (Set of listeners, unsubscribe closure) so both
 * platforms share the same mental model.
 *
 * Instantiable rather than a singleton: the process-wide instance lives in
 * `runtime.ts`, and tests (or a second pipeline) can own their own.
 */
export class LogHub {
    private readonly listeners = new Set<LogListener>();

    /** Registers a listener and returns an unsubscribe closure. */
    public subscribe(listener: LogListener): () => void {
        this.listeners.add(listener);

        return () => {
            this.listeners.delete(listener);
        };
    }

    /** Broadcasts an entry to every registered listener. */
    public publish(entry: LogEntry): void {
        this.listeners.forEach(listener => {
            // Isolate listener failures so one broken sink cannot block the
            // others. Swallow intentionally: logging must never throw, and
            // reporting the failure through the logger would recurse.
            try {
                listener(entry);
            } catch {
                /* noop */
            }
        });
    }

    /** Number of currently registered listeners. */
    public size(): number {
        return this.listeners.size;
    }
}
