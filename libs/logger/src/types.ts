/** Log severity levels shared by the web and native logging pipelines. */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Runtime a log entry originated from. Recorded when an entry crosses a
 * runtime boundary (web → native bridge relay, pure-native → JS emitter) so
 * merged buffers can tell origins apart without rewriting `tag`. Absent for
 * entries born in the local runtime. (ADR-0047)
 */
export type LogOrigin = 'web' | 'native';

/** A single log record published through the log hub. */
export interface LogEntry {
    level: LogLevel;
    tag: string;
    message: string;
    data?: unknown;
    error?: unknown;
    /** Epoch milliseconds stamped when the entry is published. */
    timestamp: number;
    /** Origin runtime, set only when the entry crossed a runtime boundary. */
    source?: LogOrigin;
}

/**
 * Read-only async view over a log buffer, used to assemble report
 * breadcrumbs. Implementations route to the buffer that owns the merged
 * stream — the native buffer in hybrid runs, the local web buffer standalone
 * (ADR-0047 "outermost shell owns the merged buffer").
 */
export interface LogSource {
    /** Returns up to `count` of the most recent entries, oldest→newest. */
    tail(count: number): Promise<LogEntry[]>;
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
