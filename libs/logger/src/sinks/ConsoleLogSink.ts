import type { LogEntry, LogListener, LogLevel } from '../core/types';

const CONSOLE_MAP: Record<LogLevel, (...args: unknown[]) => void> = {
    debug: (...args) => console.debug(...args),
    info: (...args) => console.log(...args),
    warn: (...args) => console.warn(...args),
    error: (...args) => console.error(...args),
};

/**
 * A destination for published log entries.
 *
 * The hub speaks in `LogListener` closures; a sink is the object form of one,
 * so a destination that needs state (a batch, a socket, a file handle) can be
 * a class and still subscribe through `toListener`.
 */
export interface LogSink {
    handle(entry: LogEntry): void;
}

/**
 * Mirrors log entries to the console. Output format is kept identical to the
 * legacy bridges console fallback so existing devtools filters keep working.
 */
export class ConsoleLogSink implements LogSink {
    public handle(entry: LogEntry): void {
        const fn = CONSOLE_MAP[entry.level];
        const prefix = `[${entry.tag}]`;

        if (entry.level === 'error' && entry.error !== undefined) {
            fn(prefix, entry.message, entry.error, entry.data ?? '');
        } else if (entry.data !== undefined) {
            fn(prefix, entry.message, entry.data);
        } else {
            fn(prefix, entry.message);
        }
    }

    /** The sink as a hub-subscribable closure. */
    public toListener(): LogListener {
        return entry => this.handle(entry);
    }
}

/** Convenience factory for `logHub.subscribe(createConsoleListener())`. */
export const createConsoleListener = (): LogListener => new ConsoleLogSink().toListener();
