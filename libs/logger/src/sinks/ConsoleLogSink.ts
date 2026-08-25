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

export interface ConsoleLogSinkOptions {
    /**
     * Prefix each line with the entry's **occurrence** time.
     *
     * Off by default: in a browser the devtools console stamps its own arrival
     * time, so a second one is noise. It matters where entries crossed a runtime
     * boundary — the app's terminal shows relayed web logs whose arrival time is
     * not when they happened, and reading the two orders against each other is
     * the whole point of a merged timeline.
     */
    timestamps?: boolean;
}

/**
 * Mirrors log entries to the console — the one implementation both platforms
 * subscribe. `apps/mobile` used to keep its own copy of this; the only thing it
 * did differently was the timestamp prefix, which is now an option rather than a
 * second class.
 *
 * Output format is otherwise kept identical to the legacy bridges console
 * fallback so existing devtools filters keep working.
 */
export class ConsoleLogSink implements LogSink {
    private readonly timestamps: boolean;

    constructor(options: ConsoleLogSinkOptions = {}) {
        this.timestamps = options.timestamps ?? false;
    }

    public handle(entry: LogEntry): void {
        const fn = CONSOLE_MAP[entry.level];
        const time = this.timestamps ? `[${new Date(entry.timestamp).toLocaleTimeString()}] ` : '';
        const prefix = `${time}[${entry.tag}]`;

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
export const createConsoleListener = (options: ConsoleLogSinkOptions = {}): LogListener =>
    new ConsoleLogSink(options).toListener();
