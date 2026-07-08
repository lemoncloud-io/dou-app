import type { LogEntry, LogListener } from './types';

export interface LogHub {
    /** Registers a listener and returns an unsubscribe closure. */
    subscribe(listener: LogListener): () => void;
    /** Broadcasts an entry to every registered listener. */
    publish(entry: LogEntry): void;
    /** Number of currently registered listeners. */
    size(): number;
}

/**
 * Minimal pub/sub hub for log entries. Mirrors the mobile LogService
 * subscription pattern (Set of listeners, unsubscribe closure) so both
 * platforms share the same mental model.
 */
export const createLogHub = (): LogHub => {
    const listeners = new Set<LogListener>();

    return {
        subscribe(listener: LogListener): () => void {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        publish(entry: LogEntry): void {
            listeners.forEach(listener => {
                // Isolate listener failures so one broken sink cannot block the
                // others. Swallow intentionally: logging must never throw, and
                // reporting the failure through the logger would recurse.
                try {
                    listener(entry);
                } catch {
                    /* noop */
                }
            });
        },
        size: () => listeners.size,
    };
};
