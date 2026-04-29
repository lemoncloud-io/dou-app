import { useCallback } from 'react';
import { logBufferService, logger } from '../../services';

import type { WebViewBridge } from './useBaseBridge';
import type {
    AppMessageData,
    ClearAppLogBuffer,
    FetchAppLogBuffer,
    FetchAppLogBufferSize,
    OnClearAppLogBufferPayload,
    OnFetchAppLogBufferPayload,
    OnFetchAppLogBufferSizePayload,
    OnPollAppLogBufferPayload,
    PollAppLogBuffer,
} from '@chatic/app-messages';

export const useLogBufferHandler = (bridge: WebViewBridge) => {
    const handleFetchAppLogBuffer = useCallback(
        async (message: FetchAppLogBuffer) => {
            try {
                const logs = logBufferService.peek(message.data.count);
                const response: AppMessageData<'OnFetchAppLogBuffer'> = {
                    type: 'OnFetchAppLogBuffer',
                    nonce: message.nonce,
                    data: {
                        logs,
                        size: logBufferService.getSize(),
                    } as OnFetchAppLogBufferPayload,
                };
                bridge.post(response);
            } catch (e) {
                console.error('FetchAppLogBuffer error', e);
                try {
                    bridge.post({
                        type: 'OnFetchAppLogBuffer',
                        nonce: message.nonce,
                        data: { logs: [], size: 0 } as OnFetchAppLogBufferPayload,
                    });
                } catch {
                    logger.error('LOG_BUFFER', 'Failed to post OnFetchAppLogBuffer fallback');
                }
            }
        },
        [bridge]
    );

    const handlePollAppLogBuffer = useCallback(
        async (message: PollAppLogBuffer) => {
            try {
                const logs = await logBufferService.poll(message.data.count);
                const response: AppMessageData<'OnPollAppLogBuffer'> = {
                    type: 'OnPollAppLogBuffer',
                    nonce: message.nonce,
                    data: {
                        logs,
                        size: logBufferService.getSize(),
                    } as OnPollAppLogBufferPayload,
                };
                bridge.post(response);
            } catch (e) {
                console.error('PollAppLogBuffer error', e);
                try {
                    bridge.post({
                        type: 'OnPollAppLogBuffer',
                        nonce: message.nonce,
                        data: { logs: [], size: 0 } as OnPollAppLogBufferPayload,
                    });
                } catch {
                    logger.error('LOG_BUFFER', 'Failed to post OnPollAppLogBuffer fallback');
                }
            }
        },
        [bridge]
    );

    const handleClearAppLogBuffer = useCallback(
        async (message: ClearAppLogBuffer) => {
            try {
                await logBufferService.clear();
                const response: AppMessageData<'OnClearAppLogBuffer'> = {
                    type: 'OnClearAppLogBuffer',
                    nonce: message.nonce,
                    data: {
                        success: true,
                        size: logBufferService.getSize(),
                    } as OnClearAppLogBufferPayload,
                };
                bridge.post(response);
            } catch (e) {
                console.error('ClearAppLogBuffer error', e);
                try {
                    bridge.post({
                        type: 'OnClearAppLogBuffer',
                        nonce: message.nonce,
                        data: { success: false, size: logBufferService.getSize() } as OnClearAppLogBufferPayload,
                    });
                } catch {
                    logger.error('LOG_BUFFER', 'Failed to post OnClearAppLogBuffer fallback');
                }
            }
        },
        [bridge]
    );

    const handleFetchAppLogBufferSize = useCallback(
        (message: FetchAppLogBufferSize) => {
            try {
                const response: AppMessageData<'OnFetchAppLogBufferSize'> = {
                    type: 'OnFetchAppLogBufferSize',
                    nonce: message.nonce,
                    data: {
                        size: logBufferService.getSize(),
                    } as OnFetchAppLogBufferSizePayload,
                };
                bridge.post(response);
            } catch (e) {
                console.error('FetchAppLogBufferSize error', e);
                try {
                    bridge.post({
                        type: 'OnFetchAppLogBufferSize',
                        nonce: message.nonce,
                        data: { size: 0 } as OnFetchAppLogBufferSizePayload,
                    });
                } catch {
                    logger.error('LOG_BUFFER', 'Failed to post OnFetchAppLogBufferSize fallback');
                }
            }
        },
        [bridge]
    );

    return {
        handleFetchAppLogBuffer,
        handlePollAppLogBuffer,
        handleClearAppLogBuffer,
        handleFetchAppLogBufferSize,
    };
};
