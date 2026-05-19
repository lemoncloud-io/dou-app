import { useCallback } from 'react';
import { useServices } from '../../hooks';
import type {
    ClearAppLogBuffer,
    FetchAppLogBuffer,
    FetchAppLogBufferSize,
    OnClearAppLogBufferPayload,
    OnFetchAppLogBufferPayload,
    OnFetchAppLogBufferSizePayload,
    OnPollAppLogBufferPayload,
    PollAppLogBuffer,
} from '@chatic/app-messages';

export const useLogBufferHandler = () => {
    const { logBufferService, logService: logger } = useServices();

    const handleFetchAppLogBuffer = useCallback(
        async (payload: FetchAppLogBuffer): Promise<OnFetchAppLogBufferPayload> => {
            const data = payload.data;

            try {
                const logs = logBufferService.peek(data.count);
                return {
                    logs,
                    size: logBufferService.getSize(),
                };
            } catch (e) {
                logger.error(`LOG_BUFFER`, 'FetchAppLogBuffer error', e);
                throw e;
            }
        },
        [logBufferService, logger]
    );

    const handlePollAppLogBuffer = useCallback(
        async (payload: PollAppLogBuffer): Promise<OnPollAppLogBufferPayload> => {
            const data = payload.data;

            try {
                const logs = await logBufferService.poll(data.count);
                return {
                    logs,
                    size: logBufferService.getSize(),
                };
            } catch (e) {
                logger.error('LOG_BUFFER', 'PollAppLogBuffer error', e);
                throw e;
            }
        },
        [logBufferService, logger]
    );

    const handleClearAppLogBuffer = useCallback(
        async (_message: ClearAppLogBuffer): Promise<OnClearAppLogBufferPayload> => {
            try {
                await logBufferService.clear();
                return {
                    success: true,
                    size: logBufferService.getSize(),
                };
            } catch (e) {
                logger.error('LOG_BUFFER', 'ClearAppLogBuffer error', e);
                throw e;
            }
        },
        [logBufferService, logger]
    );

    const handleFetchAppLogBufferSize = useCallback(
        async (_message: FetchAppLogBufferSize): Promise<OnFetchAppLogBufferSizePayload> => {
            try {
                return {
                    size: logBufferService.getSize(),
                };
            } catch (e) {
                logger.error('LOG_BUFFER', 'FetchAppLogBufferSize error', e);
                throw e;
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
