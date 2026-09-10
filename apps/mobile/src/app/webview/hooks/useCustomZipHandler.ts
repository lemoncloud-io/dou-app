import { useCallback } from 'react';

import type { WebMessageData } from '@chatic/app-messages';

import { applyCustomZip, disableCustomZip, isCustomZipAllowed, readCustomZipState } from '../../customZip';
import { logger } from '../../services';

/**
 * Custom web zip, driven from the web panel (ADR-0080 결정 11).
 *
 * **PROD builds refuse** — see `isCustomZipAllowed`, which carries why and reads the baked stage.
 */
const refusal = { code: 'CUSTOM_ZIP_FORBIDDEN', message: 'PROD 빌드에서는 커스텀 zip을 쓸 수 없습니다' };

export const useCustomZipHandler = () => {
    const handleApplyCustomZip = useCallback(async (message: WebMessageData<'ApplyCustomZip'>) => {
        if (!isCustomZipAllowed()) {
            logger.warn('APP', 'ApplyCustomZip refused on a PROD build');
            return { type: 'OnApplyCustomZip' as const, success: false, error: refusal };
        }
        try {
            const serverUrl = await applyCustomZip(message.data.url);
            return { type: 'OnApplyCustomZip' as const, success: true, data: { success: true, serverUrl } };
        } catch (e: any) {
            logger.error('APP', `ApplyCustomZip failed: ${message.data.url}`, e as Error);
            return {
                type: 'OnApplyCustomZip' as const,
                success: false,
                error: { code: 'CUSTOM_ZIP_ERROR', message: e.message },
            };
        }
    }, []);

    const handleDisableCustomZip = useCallback(async (_message: WebMessageData<'DisableCustomZip'>) => {
        // Not gated: turning it OFF is the recovery path, and refusing that would strand a device
        // whose build flipped to PROD while a zip was active.
        try {
            await disableCustomZip();
            return { type: 'OnDisableCustomZip' as const, success: true, data: { success: true } };
        } catch (e: any) {
            logger.error('APP', 'DisableCustomZip failed', e as Error);
            return {
                type: 'OnDisableCustomZip' as const,
                success: false,
                error: { code: 'CUSTOM_ZIP_ERROR', message: e.message },
            };
        }
    }, []);

    const handleFetchCustomZipStatus = useCallback(async (_message: WebMessageData<'FetchCustomZipStatus'>) => {
        const state = readCustomZipState();
        return {
            type: 'OnFetchCustomZipStatus' as const,
            success: true,
            data: { allowed: isCustomZipAllowed(), localRoot: state.localRoot, serverUrl: state.serverUrl },
        };
    }, []);

    return { handleApplyCustomZip, handleDisableCustomZip, handleFetchCustomZipStatus };
};
