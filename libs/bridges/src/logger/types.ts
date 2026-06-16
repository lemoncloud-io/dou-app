import type { AppLogLevel } from '@chatic/app-messages';

export type LogLevel = AppLogLevel;

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

export interface LogEntry {
    level: LogLevel;
    tag: string;
    message: string;
    data?: unknown;
    error?: unknown;
}

export interface LogAdapter {
    log(entry: LogEntry): void;
}
