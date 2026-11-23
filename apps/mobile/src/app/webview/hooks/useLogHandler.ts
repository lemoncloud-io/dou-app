import { useCallback } from 'react';
import { ingestLogEntry } from '@chatic/logger';
import type { WebMessageData } from '@chatic/bridge-messages';

export const useLogHandler = () => {
    const handleSendLog = useCallback(async (message: WebMessageData<'SendLog'>) => {
        const { level = 'info', tag, message: logMessage, data, error, timestamp, source, ...context } = message.data;

        ingestLogEntry({
            ...context,
            level,
            tag: tag ?? 'WEBVIEW',
            message: logMessage,
            data,
            error,
            timestamp: timestamp ?? Date.now(),
            source: source ?? 'web',
        });
    }, []);

    return {
        handleSendLog,
    };
};
