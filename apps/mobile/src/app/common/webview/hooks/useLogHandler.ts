import { useCallback } from 'react';
import { logger } from '../../services';
import type { SendLog } from '@chatic/app-messages';

export const useLogHandler = () => {
    const handleSendLog = useCallback((message: SendLog) => {
        const { level = 'info', message: logMessage, data, error, tag } = message.data;
        const forwardedData = { tag, data };

        switch (level) {
            case 'debug':
                logger.debug('WEBVIEW', logMessage, forwardedData);
                break;
            case 'warn':
                logger.warn('WEBVIEW', logMessage, forwardedData);
                break;
            case 'error':
                logger.error('WEBVIEW', logMessage, error ?? forwardedData);
                break;
            case 'info':
            default:
                logger.info('WEBVIEW', logMessage, forwardedData);
                break;
        }
    }, []);

    return {
        handleSendLog,
    };
};
