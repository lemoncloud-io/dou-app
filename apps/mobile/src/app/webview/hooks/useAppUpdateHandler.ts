import { useCallback } from 'react';
import { useServices } from '../../hooks';
import type { WebMessageData } from '@chatic/app-messages';

export const useAppUpdateHandler = () => {
    const { versionService, logService: logger } = useServices();

    /**
     * Checks the current app version against the live store version.
     */
    const handleCheckAppUpdate = useCallback(
        async (_message: WebMessageData<'CheckAppUpdate'>) => {
            try {
                const result = await versionService.checkForUpdate();
                return {
                    type: 'OnCheckAppUpdate' as const,
                    success: true,
                    data: result,
                };
            } catch (error: any) {
                logger.error('VERSION', 'CheckAppUpdate failed', error);
                return {
                    type: 'OnCheckAppUpdate' as const,
                    success: false,
                    error: { code: 'CHECK_APP_UPDATE_ERROR', message: error.message },
                };
            }
        },
        [versionService, logger]
    );

    /**
     * Opens the platform app store listing.
     */
    const handleOpenStore = useCallback(
        async (_message: WebMessageData<'OpenStore'>) => {
            try {
                await versionService.openStore();
                return { type: 'OnOpenStore' as const, success: true };
            } catch (error: any) {
                logger.error('VERSION', 'OpenStore failed', error);
                return {
                    type: 'OnOpenStore' as const,
                    success: false,
                    error: { code: 'OPEN_STORE_ERROR', message: error.message },
                };
            }
        },
        [versionService, logger]
    );

    return { handleCheckAppUpdate, handleOpenStore };
};
