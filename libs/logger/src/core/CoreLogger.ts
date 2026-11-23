import { createLogId } from './logId';

import type { LogHub } from './LogHub';
import type { LogContext, LogContextProvider, LogEntry, LogErrorOptions, Logger, LogLevel } from './types';

export interface CoreLoggerOptions {
    hub: LogHub;
}

const isLogErrorOptions = (value: unknown): value is LogErrorOptions => {
    if (!value || typeof value !== 'object') return false;
    return 'error' in value || 'data' in value;
};

const toHttpStatus = (value: unknown): number | undefined =>
    typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 599 ? value : undefined;

const toErrorCode = (value: unknown): string | undefined => {
    if (typeof value === 'string') return value || undefined;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return undefined;
};

const normalizeErrorOptions = (options: LogErrorOptions | unknown, asError: boolean): LogErrorOptions => {
    if (options === undefined || isLogErrorOptions(options)) return (options as LogErrorOptions) ?? {};
    return asError ? { error: options } : { data: options };
};

export class CoreLogger implements Logger {
    private readonly hub: LogHub;
    private contextProvider?: LogContextProvider;

    constructor(options: CoreLoggerOptions) {
        this.hub = options.hub;
    }

    public setContextProvider(provider: LogContextProvider | undefined): void {
        this.contextProvider = provider;
    }

    public ingest(entry: LogEntry): void {
        const stamped: LogEntry = entry.id ? entry : { ...entry, id: createLogId() };

        this.hub.publish(stamped);
    }

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

        this.dispatch(level, tag, message, normalized);
    }

    private dispatch(level: LogLevel, tag: string, message: string, options: LogErrorOptions): void {
        const httpStatus = toHttpStatus(options.httpStatus);
        const errorCode = toErrorCode(options.errorCode);

        this.ingest({
            ...this.readContext(),
            id: createLogId(),
            level,
            tag,
            message,
            data: options.data,
            error: options.error,
            ...(httpStatus !== undefined ? { httpStatus } : {}),
            ...(errorCode !== undefined ? { errorCode } : {}),
            timestamp: Date.now(),
        });
    }

    private readContext(): LogContext {
        if (!this.contextProvider) return {};

        try {
            return this.contextProvider() ?? {};
        } catch {
            return {};
        }
    }
}
