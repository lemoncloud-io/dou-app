import { DEFAULT_ERROR_FLUSH_MIN_INTERVAL_MS, DEFAULT_PERSIST_DEBOUNCE_MS } from './LogPersistence';

import type { AttachLogPersistenceOptions, LogPersistence } from './LogPersistence';
import type { LogBuffer } from '../core/LogBuffer';
import type { LogHub } from '../core/LogHub';
import type { LogEntry } from '../core/types';

export interface LogPersistenceBinderDeps {
    hub: LogHub;
    buffer: LogBuffer;
}

/**
 * Keeps a `LogPersistence` adapter in step with a log stream: saves a buffer
 * snapshot debounced on every entry, flushing immediately (rate-limited) on
 * error-level entries so a crash right after an error loses as little tail as
 * possible.
 *
 * A class because the binding is stateful — a pending timer and the last
 * error-flush timestamp outlive any single entry — and because `detach` has to
 * be able to cancel and flush that state. The hub and buffer are injected, so a
 * test can bind against its own pair instead of the process-wide one.
 */
export class LogPersistenceBinder {
    private readonly debounceMs: number;
    private readonly minErrorInterval: number;
    private timer?: ReturnType<typeof setTimeout>;
    private lastErrorFlush = 0;
    private unsubscribe?: () => void;

    constructor(
        private readonly persistence: LogPersistence,
        private readonly deps: LogPersistenceBinderDeps,
        options: AttachLogPersistenceOptions = {}
    ) {
        this.debounceMs = options.debounceMs ?? DEFAULT_PERSIST_DEBOUNCE_MS;
        this.minErrorInterval = options.errorFlushMinIntervalMs ?? DEFAULT_ERROR_FLUSH_MIN_INTERVAL_MS;
    }

    /** Optionally restores the persisted snapshot, then starts saving. */
    public attach(options: { restore?: boolean } = {}): void {
        if (this.unsubscribe) return;

        if (options.restore) {
            // A corrupt store must never block logging — start fresh instead.
            try {
                this.deps.buffer.load(this.persistence.load());
            } catch {
                /* noop */
            }
        }

        this.unsubscribe = this.deps.hub.subscribe(entry => this.onEntry(entry));
    }

    /** Stops saving and writes whatever the debounce still owes. */
    public detach(): void {
        this.unsubscribe?.();
        this.unsubscribe = undefined;
        this.flush();
    }

    /** Writes the current snapshot now, cancelling any pending debounce. */
    public flush(): void {
        if (this.timer !== undefined) {
            clearTimeout(this.timer);
            this.timer = undefined;
        }
        // Persistence failures must never break the logging pipeline.
        try {
            this.persistence.save(this.deps.buffer.peek());
        } catch {
            /* noop */
        }
    }

    private onEntry(entry: LogEntry): void {
        if (entry.level === 'error') {
            const now = Date.now();
            // Rate-limit immediate flushes so an error storm cannot turn every
            // entry into a synchronous storage write.
            if (now - this.lastErrorFlush >= this.minErrorInterval) {
                this.lastErrorFlush = now;
                this.flush();
                return;
            }
        }

        if (this.timer === undefined) {
            this.timer = setTimeout(() => this.flush(), this.debounceMs);
        }
    }
}
