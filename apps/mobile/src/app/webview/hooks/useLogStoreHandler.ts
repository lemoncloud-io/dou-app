import { useCallback } from 'react';
import type { WebMessageData } from '@chatic/bridge-messages';

import { useServices } from '../../hooks';

export const useLogStoreHandler = () => {
    const { logUploadQueueService, logService: logger } = useServices();

    const handleFetchLogUploadQueue = useCallback(
        async (message: WebMessageData<'FetchLogUploadQueue'>) => {
            try {
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
