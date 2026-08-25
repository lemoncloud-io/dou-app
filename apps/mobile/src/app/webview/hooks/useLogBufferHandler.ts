import { useCallback } from 'react';
import type { WebMessageData } from '@chatic/app-messages';

/**
 * Tombstone handlers for the retired ring buffer.
 *
 * The store these four messages read is gone — the unsent queue is the only log
 * store now, and it has its own messages (`FetchLogUploadQueue` /
 * `AckLogUploadQueue`). The handlers stay registered anyway, because the web
 * ships ahead of the app: a web build that predates this change is installed
 * against this app and still sends these. Unregistering would answer
 * `NOT_FOUND`, which its debug screen surfaces as a failure; answering an empty
 * buffer degrades to an empty list instead.
 *
 * They deliberately do NOT fall back to the upload queue. `PollAppLogBuffer` is
 * destructive by contract, and serving the queue through it would let an old web
 * build drain entries the server has not accepted yet — breaking at-least-once
 * to make a debug screen look populated.
 *
 * Delete these once no deployed web build calls them.
 */
export const useLogBufferHandler = () => {
    const handleFetchAppLogBuffer = useCallback(
        async (_message: WebMessageData<'FetchAppLogBuffer'>) => ({
            type: 'OnFetchAppLogBuffer' as const,
            success: true,
            data: { logs: [], size: 0 },
        }),
        []
    );

    const handlePollAppLogBuffer = useCallback(
        async (_message: WebMessageData<'PollAppLogBuffer'>) => ({
            type: 'OnPollAppLogBuffer' as const,
            success: true,
            data: { logs: [], size: 0 },
        }),
        []
    );

    const handleClearAppLogBuffer = useCallback(
        async (_message: WebMessageData<'ClearAppLogBuffer'>) => ({
            type: 'OnClearAppLogBuffer' as const,
            success: true,
            // Truthful: there is nothing left to clear, so clearing succeeded.
            data: { success: true, size: 0 },
        }),
        []
    );

    const handleFetchAppLogBufferSize = useCallback(
        async (_message: WebMessageData<'FetchAppLogBufferSize'>) => ({
            type: 'OnFetchAppLogBufferSize' as const,
            success: true,
            data: { size: 0 },
        }),
        []
    );

    return {
        handleFetchAppLogBuffer,
        handlePollAppLogBuffer,
        handleClearAppLogBuffer,
        handleFetchAppLogBufferSize,
    };
};
