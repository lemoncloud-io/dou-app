import { useCallback } from 'react';
import { ingestLogEntry } from '@chatic/logger';
import type { WebMessageData } from '@chatic/app-messages';
import type { LogEntry } from '@chatic/logger';

import { useServices } from '../../hooks';

/**
 * Batch log relay + server-bound queue handlers (ADR-0063).
 *
 * This replaces the per-entry `SendLog` path for hybrid runs. `useLogHandler`
 * stays registered so an older web build keeps working.
 *
 * The level split lives here, on the receiving side. Every level goes into the
 * merged ring buffer, because that buffer is the breadcrumb source in a hybrid
 * run and `debug` is the HTTP-request context a crash investigation wants most.
 * Only non-debug reaches the queue. Splitting on the sending side would mean two
 * bridge round trips per interval instead of one, undoing what batching bought.
 */
export const useLogBatchHandler = () => {
    const { logUploadQueueService, logService: logger } = useServices();

    const handleSendLogBatch = useCallback(
        async (message: WebMessageData<'SendLogBatch'>) => {
            try {
                const logs = message.data.logs ?? [];

                // Ingested as-is: no restamping of timestamp, tag or source, so
                // an entry keeps the identity it had where it happened. Same
                // contract as the single-entry path.
                const entries: LogEntry[] = logs.map(info => ({
                    ...info,
                    level: info.level ?? 'info',
                    tag: info.tag ?? 'WEBVIEW',
                    message: info.message ?? '',
                    timestamp: info.timestamp ?? Date.now(),
                    source: info.source ?? 'web',
                }));

                entries.forEach(ingestLogEntry);
                const { accepted, size } = logUploadQueueService.charge(entries);

                return {
                    type: 'OnSendLogBatch' as const,
                    success: true,
                    data: { accepted, size },
                };
            } catch (e: any) {
                logger.error('LOG_BUFFER', 'SendLogBatch error', e);
                return {
                    type: 'OnSendLogBatch' as const,
                    success: false,
                    error: { code: 'LOG_ERROR', message: e.message },
                };
            }
        },
        [logUploadQueueService, logger]
    );

    const handleFetchLogUploadQueue = useCallback(
        async (message: WebMessageData<'FetchLogUploadQueue'>) => {
            try {
                // Non-destructive by contract — `ack` is what releases entries.
                const logs = logUploadQueueService.fetch(message.data.limit);
                return {
                    type: 'OnFetchLogUploadQueue' as const,
                    success: true,
                    data: { logs, size: logUploadQueueService.getSize() },
                };
            } catch (e: any) {
                logger.error('LOG_BUFFER', 'FetchLogUploadQueue error', e);
                return {
                    type: 'OnFetchLogUploadQueue' as const,
                    success: false,
                    error: { code: 'LOG_ERROR', message: e.message },
                };
            }
        },
        [logUploadQueueService, logger]
    );

    const handleAckLogUploadQueue = useCallback(
        async (message: WebMessageData<'AckLogUploadQueue'>) => {
            try {
                const size = logUploadQueueService.ack(message.data.ids ?? []);
                return {
                    type: 'OnAckLogUploadQueue' as const,
                    success: true,
                    data: { size },
                };
            } catch (e: any) {
                logger.error('LOG_BUFFER', 'AckLogUploadQueue error', e);
                return {
                    type: 'OnAckLogUploadQueue' as const,
                    success: false,
                    error: { code: 'LOG_ERROR', message: e.message },
                };
            }
        },
        [logUploadQueueService, logger]
    );

    const handleClearLogUploadQueue = useCallback(
        async (_message: WebMessageData<'ClearLogUploadQueue'>) => {
            try {
                // Device opt-out only. The ring buffer is untouched: opt-out is
                // about what leaves the device, and breadcrumbs never do on
                // their own.
                const size = logUploadQueueService.clear();
                return {
                    type: 'OnClearLogUploadQueue' as const,
                    success: true,
                    data: { size },
                };
            } catch (e: any) {
                logger.error('LOG_BUFFER', 'ClearLogUploadQueue error', e);
                return {
                    type: 'OnClearLogUploadQueue' as const,
                    success: false,
                    error: { code: 'LOG_ERROR', message: e.message },
                };
            }
        },
        [logUploadQueueService, logger]
    );

    return {
        handleSendLogBatch,
        handleFetchLogUploadQueue,
        handleAckLogUploadQueue,
        handleClearLogUploadQueue,
    };
};
