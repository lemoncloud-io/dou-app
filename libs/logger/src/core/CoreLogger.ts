import { createLogId } from './logId';

import type { LogHub } from './LogHub';
import type { LogContext, LogContextProvider, LogEntry, LogErrorOptions, Logger, LogLevel } from './types';

export interface CoreLoggerOptions {
    /** Where published entries are broadcast. */
    hub: LogHub;
}

const isLogErrorOptions = (value: unknown): value is LogErrorOptions => {
    if (!value || typeof value !== 'object') return false;
    return 'error' in value || 'data' in value;
};

/**
 * Splits the third argument into `{ error, data }`.
 *
 * A value that is not the options shape is `data` — `logger.info(tag, msg, { kind })` means the
 * object is the payload. The one exception is `error(tag, msg, err)`, whose long-standing shorthand
 * passes the exception itself; `asError` says which reading applies.
 */
const normalizeErrorOptions = (options: LogErrorOptions | unknown, asError: boolean): LogErrorOptions => {
    if (options === undefined || isLogErrorOptions(options)) return (options as LogErrorOptions) ?? {};
    return asError ? { error: options } : { data: options };
};

/**
 * The logging engine: stamps entries and publishes them to the hub.
 *
 * Pure in the sense that matters here — it reads no platform state itself. The
 * hub and the context provider both come from outside, so the same class serves
 * the process-wide singleton in `runtime.ts` and an isolated instance in a test.
 *
 * The engine holds no store of its own, and no sink either. It used to carry a
 * console fallback that fired whenever the hub happened to have no subscriber —
 * which meant output appeared or vanished depending on how many listeners were
 * attached at that instant, and made "detach a listener" a decision about
 * console output too. That is not pub/sub. Anything that wants to see entries
 * subscribes, including the console (principle 16).
 *
 * It holds no store either. It used to push every entry into a ring buffer,
 * which was how entries dispatched before any app wiring ran were still
 * captured. That guarantee is now the wiring order's job: the listeners
 * subscribe to the hub, and boot registers them before anything logs
 * (principle 15).
 */
export class CoreLogger implements Logger {
    private readonly hub: LogHub;
    private contextProvider?: LogContextProvider;

    constructor(options: CoreLoggerOptions) {
        this.hub = options.hub;
    }

    /**
     * Registers the source of occurrence-time context (runId, session, route,
     * device). The host app wires this at boot, before anything logs; the pure
     * core never reads platform state itself. Pass `undefined` to detach.
     */
    public setContextProvider(provider: LogContextProvider | undefined): void {
        this.contextProvider = provider;
    }

    /**
     * Ingests an entry that was already stamped in another runtime (bridge
     * relay, native emitter): published as-is, WITHOUT restamping `timestamp`
     * or its context, so entries that crossed a boundary keep their original
     * occurrence times and labels. (ADR-0097)
     *
     * The one field that may be filled in is `id`, and only when absent: an
     * older app relaying entries without one would otherwise be undedupable,
     * and a resend would store a second document. Backfilling here gives such
     * an entry a stable key from the moment it enters this runtime.
     */
    public ingest(entry: LogEntry): void {
        const stamped: LogEntry = entry.id ? entry : { ...entry, id: createLogId() };

        this.hub.publish(stamped);
    }

    /**
     * All four levels normalize the same third argument.
     *
     * `debug`/`info`/`warn` used to store it verbatim, so `{ error, data }` — the shape 42 call
     * sites wrote — landed as `data.data` with `entry.error` empty. Unwrapping here rather than at
     * those sites means the trap cannot come back: a new caller writing either shape gets the same
     * entry. See {@link LogErrorOptions}.
     */
    public debug(tag: string, message: string, options?: LogErrorOptions): void;
    public debug(tag: string, message: string, data?: unknown): void;
    public debug(tag: string, message: string, options?: LogErrorOptions | unknown): void {
        this.dispatchNormalized('debug', tag, message, options);
    }

    public info(tag: string, message: string, options?: LogErrorOptions): void;
    public info(tag: string, message: string, data?: unknown): void;
    public info(tag: string, message: string, options?: LogErrorOptions | unknown): void {
        this.dispatchNormalized('info', tag, message, options);
    }

    public warn(tag: string, message: string, options?: LogErrorOptions): void;
    public warn(tag: string, message: string, data?: unknown): void;
    public warn(tag: string, message: string, options?: LogErrorOptions | unknown): void {
        this.dispatchNormalized('warn', tag, message, options);
    }

    public error(tag: string, message: string, options?: LogErrorOptions): void;
    public error(tag: string, message: string, error: unknown): void;
    public error(tag: string, message: string, options?: LogErrorOptions | unknown): void {
        this.dispatchNormalized('error', tag, message, options);
    }

    private dispatchNormalized(
        level: LogLevel,
        tag: string,
        message: string,
        options?: LogErrorOptions | unknown
    ): void {
        const normalized = normalizeErrorOptions(options, level === 'error');

        this.dispatch(level, tag, message, normalized.data, normalized.error);
    }

    private dispatch(level: LogLevel, tag: string, message: string, data?: unknown, error?: unknown): void {
        // Context is spread first so the entry's own fields always win, and the id
        // is issued here (not at flush) so it survives retries of the same entry.
        this.ingest({
            ...this.readContext(),
            id: createLogId(),
            level,
            tag,
            message,
            data,
            error,
            timestamp: Date.now(),
        });
    }

    private readContext(): LogContext {
        if (!this.contextProvider) return {};

        try {
            return this.contextProvider() ?? {};
        } catch {
            // A broken provider must never take logging down with it.
            return {};
        }
    }
}
