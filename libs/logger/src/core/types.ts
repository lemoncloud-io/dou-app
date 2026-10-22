import type { LogTag } from './tags';

/** Log severity levels shared by the web and native logging pipelines. */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Runtime a log entry originated from. Recorded when an entry crosses a
 * runtime boundary (web → native bridge relay, pure-native → JS emitter) so
 * merged buffers can tell origins apart without rewriting `tag`. Absent for
 * entries born in the local runtime. (ADR-0097)
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
    /**
     * Usage session id. Shorter-lived than `runId`: a run can sit in the background for days, so a
     * return after more than 30 minutes away starts a new session. Usage analysis groups by this;
     * sampling still follows `runId`.
     */
    sessionId?: string;
    /** `ios` · `android` · `web` — the device family, regardless of whether the web runs in the app. */
    platform?: LogPlatform;
    /** `app` inside the mobile app's WebView or native code, `browser` for the standalone web. */
    host?: LogHost;
    /** Connection type at the time — the browser's `effectiveType` or the native connection type. */
    network?: string;
    /** UI locale. */
    locale?: string;
}

/**
 * Open like `LogTag`, for the same reason: the context crosses the bridge from a runtime built at
 * another time, and a value this build does not know must survive the hop rather than fail a type.
 */
export type LogPlatform = 'ios' | 'android' | 'web' | (string & {});

export type LogHost = 'app' | 'browser' | (string & {});

/**
 * What an entry records.
 *
 * `log` is every entry this pipeline has always carried, and it is the default: an entry with no
 * `kind` is a log, and a log entry leaves `kind` off the wire so the server's log list (which reads
 * "no kind, or `log`") keeps working unchanged. The other three are statistics riding the same
 * queue, uploader and endpoint:
 *
 * - `trace` — a span with a start and an end (`durationMs`).
 * - `sample` — one value that arrived already finished (a web vital, a bridge round trip).
 * - `event` — a user action or a lifecycle moment, counted rather than timed.
 */
export type LogKind = 'log' | 'trace' | 'sample' | 'event';

/** The three statistics kinds. */
export type TelemetryKind = Exclude<LogKind, 'log'>;

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
    /** What the entry records. Absent means `log` — see {@link LogKind}. */
    kind?: LogKind;
    /**
     * HTTP status of a failed request, as a number. Top-level rather than inside `message` or the
     * capped `error` string so the server can find "every 401" with one filter.
     */
    httpStatus?: number;
    /** The error code a server, an SDK or a native module returned, verbatim. */
    errorCode?: string;

    // ── Statistics only (`kind` other than `log`). The wire drops these from a log entry. ──

    /** A trace's length in milliseconds. */
    durationMs?: number;
    /**
     * Dimensions, from the statistics catalogue only. At most 16; keys `[A-Za-z][A-Za-z0-9_]{0,39}`,
     * values at most 100 characters. Unlike `data`, this reaches the server as an object.
     */
    attrs?: Record<string, string>;
    /** Integer measurements, from the statistics catalogue only. At most 32. Sent as numbers. */
    metrics?: Record<string, number>;
    /** The sampling rate this entry was kept at, `0..1`. The server weighs it as `1 / sr`. */
    sr?: number;
    /** Version of the sampling policy that decided it. `0` is the built-in default. */
    pv?: number;
    /** Increases monotonically within a run, so two entries in the same millisecond keep their order. */
    seq?: number;
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
 * ADR-0099 exists to make readable — was a level deeper than every reader looks.
 *
 * 42 call sites wrote it that way, which is the answer to whether the signature or the callers were
 * wrong. Normalizing here costs nothing a caller wanted: no site in the tree passes a payload whose
 * own field is named `data` or `error`, and one that did would now surface it as the entry's field
 * of that name — the more useful reading of the two.
 */
export interface LogErrorOptions {
    error?: unknown;
    data?: unknown;
    /**
     * Lifted onto the entry's own `httpStatus` / `errorCode`.
     *
     * Read only from an object that already has `error` or `data`. A bare payload such as
     * `logger.warn(tag, msg, { errorCode })` stays `data`, as it always has — treating these two keys
     * as the options shape on their own would move a call site's payload out of `data` silently.
     */
    httpStatus?: number;
    errorCode?: string;
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
