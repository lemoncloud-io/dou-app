import { useCallback } from 'react';

import type { WebMessageData } from '@chatic/app-messages';

import { bootMetricsService, logger } from '../../services';
import { useDebugSettingsStore } from '../../stores';

/**
 * Handles perf/debug bridge messages from the web:
 * - SendBootMetrics: merge the web boot snapshot into the current boot record.
 * - SetDebugMode: persist the unlock flag so the native debug overlay opens in
 *   PROD builds too (single 10-tap unlock covers both layers).
 */
export const usePerfHandler = () => {
    const setDebugModeEnabled = useDebugSettingsStore(state => state.setDebugModeEnabled);

    const handleSendBootMetrics = useCallback(async (message: WebMessageData<'SendBootMetrics'>) => {
        bootMetricsService.attachWebMetrics(message.data);
        return {
            type: 'OnSendBootMetrics' as const,
            success: true,
            data: {},
        };
    }, []);

    const handleSetDebugMode = useCallback(
        async (message: WebMessageData<'SetDebugMode'>) => {
            const { enabled } = message.data;
            logger.info('APP', `SetDebugMode received from web: ${enabled}`);
            setDebugModeEnabled(enabled);
            return {
                type: 'OnSetDebugMode' as const,
                success: true,
                data: { enabled },
            };
        },
        [setDebugModeEnabled]
    );

    return { handleSendBootMetrics, handleSetDebugMode };
};
