import { useCallback } from 'react';
import { ingestLogEntry } from '@chatic/logger';
import type { WebMessageData } from '@chatic/app-messages';

export const useLogHandler = () => {
    const handleSendLog = useCallback(async (message: WebMessageData<'SendLog'>) => {
        const { level = 'info', tag, message: logMessage, data, error, timestamp, source } = message.data;

        // Ingest as-is (ADR-0047): the original tag, occurrence timestamp and
        // source survive the bridge instead of being rewritten to WEBVIEW /
        // receive-time, and data+error ride together (no more either/or).
        // `timestamp` is absent for pre-ADR-0047 web builds — fall back to
        // receive time so legacy payloads keep working.
        ingestLogEntry({
            level,
            tag: tag ?? 'WEBVIEW',
            message: logMessage,
            data,
            error,
            timestamp: timestamp ?? Date.now(),
            source: source ?? 'web',
        });

        return { type: 'OnSendLog' as const, success: true };
    }, []);

    return {
        handleSendLog,
    };
};
