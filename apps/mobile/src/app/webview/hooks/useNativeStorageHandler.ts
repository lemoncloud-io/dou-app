import { useCallback } from 'react';

import type { WebMessageData } from '@chatic/app-messages';

import { logger, provider } from '../../services';

/**
 * The debug panel's storage screen, native half: report what the shell persists, and empty its SQLite
 * cache. The web measures and clears its own storage itself; inside the app the chat cache and the
 * invited-cloud list live here, so the panel has to ask for this half.
 *
 * `provider.nativeStorageService` is read inside each callback so SQLite opens only when the screen
 * actually asks, never at render.
 */
export const useNativeStorageHandler = () => {
    const handleFetchNativeStorageSummary = useCallback(
        async (_message: WebMessageData<'FetchNativeStorageSummary'>) => {
            try {
                const data = await provider.nativeStorageService.summarize();
                return { type: 'OnFetchNativeStorageSummary' as const, success: true, data };
            } catch (e: any) {
                logger.error('STORAGE', 'FetchNativeStorageSummary error', e as Error);
                return {
                    type: 'OnFetchNativeStorageSummary' as const,
                    success: false,
                    error: { code: 'NATIVE_STORAGE_ERROR', message: e.message },
                };
            }
        },
        []
    );

    const handleClearNativeCache = useCallback(async (message: WebMessageData<'ClearNativeCache'>) => {
        try {
            // Strictly `true`: a malformed payload must not be read as consent to drop invited clouds.
            const includeInvitedClouds = message.data?.includeInvitedClouds === true;
            const data = await provider.nativeStorageService.clearCache({ includeInvitedClouds });
            return { type: 'OnClearNativeCache' as const, success: true, data };
        } catch (e: any) {
            logger.error('STORAGE', 'ClearNativeCache error', e as Error);
            return {
                type: 'OnClearNativeCache' as const,
                success: false,
                error: { code: 'NATIVE_STORAGE_ERROR', message: e.message },
            };
        }
    }, []);

    return { handleFetchNativeStorageSummary, handleClearNativeCache };
};
