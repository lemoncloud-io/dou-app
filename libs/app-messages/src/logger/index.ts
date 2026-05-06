import { getMobileAppInfo } from '../utils';
import { createConsoleFallbackAdapter } from './adapters/consoleFallbackAdapter';
import { createNativeBridgeAdapter } from './adapters/nativeBridgeAdapter';
import type { Logger, LogEntry } from './types';

const dispatch = (entry: LogEntry): void => {
    const { isOnMobileApp } = getMobileAppInfo();
    const adapter = isOnMobileApp ? createNativeBridgeAdapter() : createConsoleFallbackAdapter();

    adapter.log(entry);
};

export const logger: Logger = {
    debug(tag, message, data) {
        dispatch({ level: 'debug', tag, message, data });
    },
    info(tag, message, data) {
        dispatch({ level: 'info', tag, message, data });
    },
    warn(tag, message, data) {
        dispatch({ level: 'warn', tag, message, data });
    },
    error(tag, message, options) {
        dispatch({
            level: 'error',
            tag,
            message,
            data: options?.data,
            error: options?.error,
        });
    },
};

export type { LogAdapter, LogEntry, LogErrorOptions, Logger, LogLevel } from './types';
