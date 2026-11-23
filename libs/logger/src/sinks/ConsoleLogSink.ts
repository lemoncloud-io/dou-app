import type { LogEntry, LogListener, LogLevel } from '../core/types';

const CONSOLE_MAP: Record<LogLevel, (...args: unknown[]) => void> = {
    debug: (...args) => console.debug(...args),
    info: (...args) => console.log(...args),
    warn: (...args) => console.warn(...args),
    error: (...args) => console.error(...args),
};

export interface LogSink {
    handle(entry: LogEntry): void;
}

export interface ConsoleLogSinkOptions {
    timestamps?: boolean;
}

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

    public toListener(): LogListener {
        return entry => this.handle(entry);
    }
}

export const createConsoleListener = (options: ConsoleLogSinkOptions = {}): LogListener =>
    new ConsoleLogSink(options).toListener();
