import { useCallback } from 'react';
import type { WebMessageData } from '@chatic/app-messages';
import { useServices } from '../../hooks';

/**
 * Backs `@chatic/config`'s shell lane (ADR-0079 결정 9). Unlike `usePreferenceCacheHandler`, this
 * handler validates nothing about `key`/`value` — the registry that gives them meaning lives in the
 * web bundle, not here. See `ConfigKvService` for why an unvalidated write is safe now that
 * ADR-0080 결정 13 removed the one capability (`debugSettings`/`webviewBaseUrlOverride`) an
 * untrusted write could previously abuse.
 */
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
