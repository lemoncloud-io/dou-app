import { logger } from './log';
import { serializeError } from './utils';

let unsubscribeConsoleLog: (() => void) | undefined;

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

initConsoleService();
