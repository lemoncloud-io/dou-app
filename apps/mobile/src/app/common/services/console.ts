import { logger } from './log';

let unsubscribeConsoleLog: (() => void) | undefined;

/**
 * - 구조화된 에러 문자열 치환
 * @param error error 객체
 */
const serializeError = (error: any) => {
    if (!error) return 'Unknown error.';

    if (error instanceof Error) {
        return {
            ...error,
            name: error.name,
            message: error.message,
            stack: error.stack,
        };
    }

    if (typeof error === 'object') {
        return error;
    }

    return String(error);
};

export const initConsoleService = () => {
    if (unsubscribeConsoleLog) return unsubscribeConsoleLog;

    unsubscribeConsoleLog = logger.subscribe((level, tag, message, data, error) => {
        if (!__DEV__) return;

        const time = new Date().toLocaleTimeString();
        const prefix = `[${time}] [${tag}] ${message}`;

        if (level === 'error') {
            console.error(prefix, serializeError(error));
            return;
        }

        console[level](prefix, data ? data : '');
    });

    return unsubscribeConsoleLog;
};

export const teardownConsoleService = () => {
    unsubscribeConsoleLog?.();
    unsubscribeConsoleLog = undefined;
};

initConsoleService();
