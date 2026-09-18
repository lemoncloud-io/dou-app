import { useCallback } from 'react';
import { ingestLogEntry } from '@chatic/logger';
import type { WebMessageData } from '@chatic/app-messages';

export const useLogHandler = () => {
    const handleSendLog = useCallback(async (message: WebMessageData<'SendLog'>) => {
        const { level = 'info', tag, message: logMessage, data, error, timestamp, source, ...context } = message.data;

        // Ingest as-is (ADR-0097): the original tag, occurrence timestamp and
        // source survive the bridge instead of being rewritten to WEBVIEW /
        // receive-time, and data+error ride together (no more either/or).
        // `timestamp` is absent for pre-ADR-0097 web builds — fall back to
        // receive time so legacy payloads keep working.
        // The id and occurrence-time context are spread first so the explicit
        // fields below always win. Keeping the id is what lets the same entry
        // be uploaded from either side without becoming two documents.
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

        // Intentionally sends no response. The web's log forwarder (`createNativeForwarder`)
        // bypasses `WebBridgeClient` and ships entries up without a refId, so even if `OnSendLog`
        // were sent back down there's no pending call to match it against — it would just get
        // discarded as a listener-less event. But every one of those discarded responses still
        // costs one UI-thread evaluateJavascript round trip, the same resource a cache round trip
        // spends. Since the cache instrumentation logs a warning on every slow call, once things
        // start to back up the log volume grows in step with the cache request volume, so this
        // waste ended up amplifying the very backpressure it was adding to.
    }, []);

    return {
        handleSendLog,
    };
};
