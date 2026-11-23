import type { LogTag } from './tags';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogOrigin = 'web' | 'native';

export interface LogContext {
    runId?: string;
    sid?: string;
    uid?: string;
    cid?: string;
    appVersion?: string;
    webVersion?: string;
    route?: string;
    os?: string;
    osVersion?: string;
    model?: string;
    sessionId?: string;
    platform?: LogPlatform;
    host?: LogHost;
    network?: string;
    locale?: string;
    routeTemplate?: string;
    sessionOwner?: string;
}

export type LogPlatform = 'ios' | 'android' | 'web' | (string & {});

export type LogHost = 'app' | 'browser' | (string & {});

export type LogKind = 'log' | 'trace' | 'sample' | 'event';

export type TelemetryKind = Exclude<LogKind, 'log'>;

export type LogContextProvider = () => LogContext | undefined;

export interface LogEntry extends LogContext {
    id?: string;
    level: LogLevel;
    tag: LogTag;
    message: string;
    data?: unknown;
    error?: unknown;
    timestamp: number;
    source?: LogOrigin;
    kind?: LogKind;
    httpStatus?: number;
    errorCode?: string;

    durationMs?: number;
    attrs?: Record<string, string>;
    metrics?: Record<string, number>;
    sr?: number;
    pv?: number;
    seq?: number;
}

export type LogListener = (entry: LogEntry) => void;

export interface LogErrorOptions {
    error?: unknown;
    data?: unknown;
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
