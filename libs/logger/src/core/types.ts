import type { LogTag } from './tags';

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
    tag: LogTag;
    message: string;
    data?: unknown;
    error?: unknown;
    /** Epoch milliseconds stamped when the entry is published. */
    timestamp: number;
    /** Origin runtime, set only when the entry crossed a runtime boundary. */
    source?: LogOrigin;
}

/** A sink that receives every published log entry. */
export type LogListener = (entry: LogEntry) => void;

/**
 * The structured third argument: an exception and/or the fields that describe it.
 *
 * Accepted by **every** level, not just `error`. It used to be `error`'s alone, and the other three
 * took a bare `data?: unknown` — which accepts this shape too, silently, and then stores it whole.
 * So `logger.warn(tag, msg, { error, data: { path } })` put the fields at `data.data.path` and left
 * `entry.error` empty: the admin console showed no error, and `data.observation` — the one key
 * ADR-0075 exists to make readable — was a level deeper than every reader looks.
 *
 * 42 call sites wrote it that way, which is the answer to whether the signature or the callers were
 * wrong. Normalizing here costs nothing a caller wanted: no site in the tree passes a payload whose
 * own field is named `data` or `error`, and one that did would now surface it as the entry's field
 * of that name — the more useful reading of the two.
 */
export interface LogErrorOptions {
    error?: unknown;
    data?: unknown;
}

export interface Logger {
    debug(tag: LogTag, message: string, options?: LogErrorOptions): void;
    debug(tag: LogTag, message: string, data?: unknown): void;
    info(tag: LogTag, message: string, options?: LogErrorOptions): void;
    info(tag: LogTag, message: string, data?: unknown): void;
    warn(tag: LogTag, message: string, options?: LogErrorOptions): void;
    warn(tag: LogTag, message: string, data?: unknown): void;
    error(tag: LogTag, message: string, options?: LogErrorOptions): void;
    error(tag: LogTag, message: string, error: unknown): void;
}
