import { createConsoleListener } from './consoleListener';
import { createLogHub } from './hub';
import { createLogId } from './id';
import { createRingBuffer } from './ringBuffer';
import type { LogContext, LogContextProvider, LogEntry, LogErrorOptions, Logger, LogLevel } from './types';

/** Number of entries retained in the in-memory log buffer. */
export const LOG_BUFFER_CAPACITY = 500;

const hub = createLogHub();
const buffer = createRingBuffer<LogEntry>(LOG_BUFFER_CAPACITY);
const consoleFallback = createConsoleListener();

const isLogErrorOptions = (value: unknown): value is LogErrorOptions => {
    if (!value || typeof value !== 'object') return false;
    return 'error' in value || 'data' in value;
};

const normalizeErrorOptions = (options?: LogErrorOptions | unknown): LogErrorOptions => {
    if (options === undefined || isLogErrorOptions(options)) return options ?? {};
    return { error: options };
};

let contextProvider: LogContextProvider | undefined;

/**
 * Registers the source of occurrence-time context (runId, session, route,
 * device). The host app wires this at boot, before anything logs; the pure
 * core never reads platform state itself. Pass `undefined` to detach.
 */
export const setLogContextProvider = (provider: LogContextProvider | undefined): void => {
    contextProvider = provider;
};

const readContext = (): LogContext => {
    if (!contextProvider) return {};
    try {
        return contextProvider() ?? {};
    } catch {
        // A broken provider must never take logging down with it.
        return {};
    }
};

/**
 * Ingests an entry that was already stamped in another runtime (bridge relay,
 * native emitter): pushed and published as-is, WITHOUT restamping
 * `timestamp` or its context, so merged buffers keep original occurrence
 * times and labels. (ADR-0047)
 *
 * The one field that may be filled in is `id`, and only when absent: an older
 * app relaying entries without one would otherwise be undedupable, and a
 * resend would store a second document. Backfilling here gives such an entry
 * a stable key from the moment it enters this runtime.
 */
export const ingestLogEntry = (entry: LogEntry): void => {
    const stamped: LogEntry = entry.id ? entry : { ...entry, id: createLogId() };

    // The buffer is fed directly (not via subscription) so it always captures
    // entries — including those emitted before any app wiring runs.
    buffer.push(stamped);

    // Zero-config fallback: apps that never wire subscribers keep the legacy
    // console output instead of silently losing their logs.
    if (hub.size() === 0) {
        consoleFallback(stamped);
    }

    hub.publish(stamped);
};

const dispatch = (level: LogLevel, tag: string, message: string, data?: unknown, error?: unknown): void => {
    // Context is spread first so the entry's own fields always win, and the id
    // is issued here (not at flush) so it survives retries of the same entry.
    ingestLogEntry({
        ...readContext(),
        id: createLogId(),
        level,
        tag,
        message,
        data,
        error,
        timestamp: Date.now(),
    });
};

/**
 * Shared pub/sub hub for log entries. Sinks (console mirror, native bridge
 * forwarder, future remote shippers) subscribe here; `logger` publishes.
 */
export const logHub = hub;

/**
 * In-memory view over the most recent log entries. Follows the mobile
 * LogBufferService semantics (peek keeps, poll consumes) so the debug UI can
 * use the same interaction model against either buffer.
 */
export const logBuffer = {
    peek: (count?: number): LogEntry[] => buffer.peek(count),
    poll: (count?: number): LogEntry[] => buffer.shift(count),
    clear: (): void => buffer.clear(),
    size: (): number => buffer.size(),
    /**
     * Prepends restored entries (from a LogPersistence adapter) AHEAD of
     * anything already captured during boot, keeping chronological order —
     * restored entries are by definition older than the current session's.
     */
    load: (entries: LogEntry[]): void => {
        if (!entries.length) return;
        const current = buffer.shift();
        [...entries, ...current].forEach(item => buffer.push(item));
    },
};

/**
 * App-wide logger facade. Publishes every entry to `logHub` and the built-in
 * ring buffer; environment-specific sinks are attached by the host app
 * (see `setupBridgeLogger` in `@chatic/bridges`).
 */
export const logger: Logger = {
    debug(tag, message, data) {
        dispatch('debug', tag, message, data);
    },
    info(tag, message, data) {
        dispatch('info', tag, message, data);
    },
    warn(tag, message, data) {
        dispatch('warn', tag, message, data);
    },
    error(tag, message, options) {
        const normalized = normalizeErrorOptions(options);

        dispatch('error', tag, message, normalized.data, normalized.error);
    },
};
