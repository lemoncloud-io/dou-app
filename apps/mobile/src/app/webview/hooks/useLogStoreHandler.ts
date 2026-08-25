import { useCallback } from 'react';
import type { WebMessageData } from '@chatic/app-messages';

import { useServices } from '../../hooks';

/**
 * Bridge handlers for the app's log store (ADR-0063 · ADR-0066).
 *
 * Read-side only. Web entries reach the store the same way native ones do — one
 * at a time through `SendLog` into the hub, where the store's own subscription
 * picks them up — so there is nothing here that writes. The `SendLogBatch`
 * handler that used to live alongside these wrote straight into the queue,
 * bypassing the hub, and that shortcut is what made the store need a `charge`
 * entry point and a `source === 'web'` filter. Both are gone with it.
 */
export const useLogStoreHandler = () => {
    const { logUploadQueueService, logService: logger } = useServices();

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
                // Device opt-out only. The breadcrumb path is untouched:
                // opt-out is about what leaves the device, and breadcrumbs
                // never do on their own.
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
        handleFetchLogUploadQueue,
        handleAckLogUploadQueue,
        handleClearLogUploadQueue,
    };
};
