import { createConsoleListener } from './consoleListener';
import { createLogHub } from './hub';
import { createRingBuffer } from './ringBuffer';
import type { LogEntry, LogErrorOptions, Logger, LogLevel } from './types';

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

/**
 * Ingests an entry that was already stamped in another runtime (bridge relay,
 * native emitter): pushed and published as-is, WITHOUT restamping
 * `timestamp`, so merged buffers keep original occurrence times. (ADR-0047)
 */
export const ingestLogEntry = (entry: LogEntry): void => {
    // The buffer is fed directly (not via subscription) so it always captures
    // entries — including those emitted before any app wiring runs.
    buffer.push(entry);

    // Zero-config fallback: apps that never wire subscribers keep the legacy
    // console output instead of silently losing their logs.
    if (hub.size() === 0) {
        consoleFallback(entry);
    }

    hub.publish(entry);
};

const dispatch = (level: LogLevel, tag: string, message: string, data?: unknown, error?: unknown): void => {
    ingestLogEntry({ level, tag, message, data, error, timestamp: Date.now() });
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
