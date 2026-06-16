import type { LogAdapter, LogEntry, LogLevel } from '../types';

const CONSOLE_MAP: Record<LogLevel, (...args: unknown[]) => void> = {
    debug: (...args) => console.debug(...args),
    info: (...args) => console.log(...args),
    warn: (...args) => console.warn(...args),
    error: (...args) => console.error(...args),
};

export const createConsoleFallbackAdapter = (): LogAdapter => ({
    log(entry: LogEntry): void {
        const fn = CONSOLE_MAP[entry.level];
        const prefix = `[${entry.tag}]`;

        if (entry.level === 'error' && entry.error !== undefined) {
            fn(prefix, entry.message, entry.error, entry.data ?? '');
        } else if (entry.data !== undefined) {
            fn(prefix, entry.message, entry.data);
        } else {
            fn(prefix, entry.message);
        }
    },
});
