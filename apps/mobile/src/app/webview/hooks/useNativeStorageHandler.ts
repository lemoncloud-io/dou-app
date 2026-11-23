import { useCallback } from 'react';

import type { WebMessageData } from '@chatic/bridge-messages';

import { logger, provider } from '../../services';

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
