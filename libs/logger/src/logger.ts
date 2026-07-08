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

const dispatch = (level: LogLevel, tag: string, message: string, data?: unknown, error?: unknown): void => {
    const entry: LogEntry = { level, tag, message, data, error, timestamp: Date.now() };

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
