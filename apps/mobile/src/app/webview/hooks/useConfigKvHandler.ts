import { useCallback } from 'react';
import type { WebMessageData } from '@chatic/bridge-messages';
import { useServices } from '../../hooks';

export const useConfigKvHandler = () => {
    const { configKvService, logService } = useServices();

    const handleSaveConfigValue = useCallback(
        async (message: WebMessageData<'SaveConfigValue'>) => {
            const { key, value } = message.data;
            try {
                await configKvService.set(key, value);
                return { type: 'OnSaveConfigValue' as const, success: true, data: { key, success: true } };
            } catch (e: any) {
                logService.error('CONFIG', `SaveConfigValue error: ${key}`, e as Error);
                return {
                    type: 'OnSaveConfigValue' as const,
                    success: false,
                    error: { code: 'CONFIG_SAVE_ERROR', message: e.message },
                };
            }
        },
        [configKvService, logService]
    );

    const handleClearConfigValue = useCallback(
        async (message: WebMessageData<'ClearConfigValue'>) => {
            const { key } = message.data;
            try {
                await configKvService.remove(key);
                return { type: 'OnClearConfigValue' as const, success: true, data: { key, success: true } };
            } catch (e: any) {
                logService.error('CONFIG', `ClearConfigValue error: ${key}`, e as Error);
                return {
                    type: 'OnClearConfigValue' as const,
                    success: false,
                    error: { code: 'CONFIG_CLEAR_ERROR', message: e.message },
                };
            }
        },
        [configKvService, logService]
    );

    return {
        handleSaveConfigValue,
        handleClearConfigValue,
    };
};
