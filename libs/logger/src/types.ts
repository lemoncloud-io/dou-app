/** Log severity levels shared by the web and native logging pipelines. */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Runtime a log entry originated from. Recorded when an entry crosses a
 * runtime boundary (web → native bridge relay, pure-native → JS emitter) so
 * merged buffers can tell origins apart without rewriting `tag`. Absent for
 * entries born in the local runtime. (ADR-0047)
 */
export type LogOrigin = 'web' | 'native';

/**
 * Occurrence-time context carried by every entry.
 *
 * These values can already differ by the time an entry reaches the server —
 * an offline queue drained on the next launch would otherwise label logs from
 * before a cloud switch with the new `cid`, pre-login logs with the logged-in
 * `uid`, and pre-update logs with the new version. So they are captured when
 * the entry is dispatched, never stamped at send time, and they ride on the
 * entry itself so they survive the bridge and any buffer copy.
 *
 * The server hoists `uid`/`sid`/`cid`/`runId`/`level` to the top of the stored
 * document to make them queryable; the rest stay inside its `meta`.
 */
export interface LogContext {
    /** App-run (process) identifier — the primary axis for log exploration. */
    runId?: string;
    /** Site id. */
    sid?: string;
    /** User id (guest or signed-in). */
    uid?: string;
    /** Cloud id. */
    cid?: string;
    /** Native app version. */
    appVersion?: string;
    /** Web bundle version — deployed independently of the app, so a separate axis. */
    webVersion?: string;
    /** Screen at the time of the log. Every entry carries it instead of emitting NAV records. */
    route?: string;
    /** Device OS. */
    os?: string;
    /** Device OS version. */
    osVersion?: string;
    /** Device model name. */
    model?: string;
}

/**
 * Supplies the current context at dispatch time. Registered by the host app
 * (`setLogContextProvider`); the pure core never reads platform state itself.
 */
export type LogContextProvider = () => LogContext | undefined;

/** A single log record published through the log hub. */
export interface LogEntry extends LogContext {
    /**
     * Client-generated globally unique id — the server's dedup key. The id
     * becomes the stored document id, so resending an entry upserts it rather
     * than creating a second document. Optional on the type for entries that
     * crossed from an older runtime, but the pipeline always fills it.
     */
    id?: string;
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
