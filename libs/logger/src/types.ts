/** Log severity levels shared by the web and native logging pipelines. */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** A single log record published through the log hub. */
export interface LogEntry {
    level: LogLevel;
    tag: string;
    message: string;
    data?: unknown;
    error?: unknown;
    /** Epoch milliseconds stamped when the entry is published. */
    timestamp: number;
}

/** A sink that receives every published log entry. */
export type LogListener = (entry: LogEntry) => void;

export interface LogErrorOptions {
    error?: unknown;
    data?: unknown;
}

export interface Logger {
    debug(tag: string, message: string, data?: unknown): void;
    info(tag: string, message: string, data?: unknown): void;
    warn(tag: string, message: string, data?: unknown): void;
    error(tag: string, message: string, options?: LogErrorOptions): void;
    error(tag: string, message: string, error: unknown): void;
}
