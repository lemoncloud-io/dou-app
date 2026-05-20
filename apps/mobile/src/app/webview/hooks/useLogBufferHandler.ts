import { useCallback } from 'react';
import { useServices } from '../../hooks';
import type { WebMessageData } from '@chatic/app-messages';

export const useLogBufferHandler = () => {
    const { logBufferService, logService: logger } = useServices();

    const handleFetchAppLogBuffer = useCallback(
        async (message: WebMessageData<'FetchAppLogBuffer'>) => {
            const data = message.payload;
            try {
                const logs = logBufferService.peek(data.count);
                return {
                    type: 'OnFetchAppLogBuffer' as const,
                    success: true,
                    data: {
                        logs,
                        size: logBufferService.getSize(),
                    },
                };
            } catch (e: any) {
                logger.error('LOG_BUFFER', 'FetchAppLogBuffer error', e);
                return {
                    type: 'OnFetchAppLogBuffer' as const,
                    success: false,
                    error: { code: 'LOG_ERROR', message: e.message },
                };
            }
        },
        [logBufferService, logger]
    );

    const handlePollAppLogBuffer = useCallback(
        async (message: WebMessageData<'PollAppLogBuffer'>) => {
            const data = message.payload;
            try {
                const logs = await logBufferService.poll(data.count);
                return {
                    type: 'OnPollAppLogBuffer' as const,
                    success: true,
                    data: {
                        logs,
                        size: logBufferService.getSize(),
                    },
                };
            } catch (e: any) {
                logger.error('LOG_BUFFER', 'PollAppLogBuffer error', e);
                return {
                    type: 'OnPollAppLogBuffer' as const,
                    success: false,
                    error: { code: 'LOG_ERROR', message: e.message },
                };
            }
        },
        [logBufferService, logger]
    );

    const handleClearAppLogBuffer = useCallback(
        async (_message: WebMessageData<'ClearAppLogBuffer'>) => {
            try {
                await logBufferService.clear();
                return {
                    type: 'OnClearAppLogBuffer' as const,
                    success: true,
                    data: {
                        success: true,
                        size: logBufferService.getSize(),
                    },
                };
            } catch (e: any) {
                logger.error('LOG_BUFFER', 'ClearAppLogBuffer error', e);
                return {
                    type: 'OnClearAppLogBuffer' as const,
                    success: false,
                    error: { code: 'LOG_ERROR', message: e.message },
                };
            }
        },
        [logBufferService, logger]
    );

    const handleFetchAppLogBufferSize = useCallback(
        async (_message: WebMessageData<'FetchAppLogBufferSize'>) => {
            try {
                return {
                    type: 'OnFetchAppLogBufferSize' as const,
                    success: true,
                    data: {
                        size: logBufferService.getSize(),
                    },
                };
            } catch (e: any) {
                logger.error('LOG_BUFFER', 'FetchAppLogBufferSize error', e);
                return {
                    type: 'OnFetchAppLogBufferSize' as const,
                    success: false,
                    error: { code: 'LOG_ERROR', message: e.message },
                };
            }
        },
        [logBufferService, logger]
    );

    return {
        handleFetchAppLogBuffer,
        handlePollAppLogBuffer,
        handleClearAppLogBuffer,
        handleFetchAppLogBufferSize,
    };
};
