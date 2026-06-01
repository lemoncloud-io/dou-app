import { isNative } from '../provider';
import { createConsoleFallbackAdapter } from './adapters/consoleFallbackAdapter';
import { createNativeBridgeAdapter } from './adapters/nativeBridgeAdapter';
import type { LogAdapter, LogEntry, LogErrorOptions, Logger } from './types';

const getAdapter = (): LogAdapter => (isNative() ? createNativeBridgeAdapter() : createConsoleFallbackAdapter());

const dispatch = (entry: LogEntry): void => {
    getAdapter().log(entry);
};

const isLogErrorOptions = (value: unknown): value is LogErrorOptions => {
    if (!value || typeof value !== 'object') return false;
    return 'error' in value || 'data' in value;
};

const normalizeErrorOptions = (options?: LogErrorOptions | unknown): LogErrorOptions => {
    if (options === undefined || isLogErrorOptions(options)) return options ?? {};
    return { error: options };
};

/**
 * 하이브리드 앱 또는 콘솔에 디버그 로그를 전송하기 위한 브릿지 로거 유틸리티입니다.
 */
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
        const normalized = normalizeErrorOptions(options);

        dispatch({
            level: 'error',
            tag,
            message,
            data: normalized.data,
            error: normalized.error,
        });
    },
};
