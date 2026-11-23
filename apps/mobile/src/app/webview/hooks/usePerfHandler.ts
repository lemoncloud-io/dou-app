import { useCallback } from 'react';

import type { WebMessageData } from '@chatic/bridge-messages';
import { isValidPerfTraceName } from '@chatic/perf';
import type { PerfTraceName } from '@chatic/perf';

import { bootMetricsService, logger, perfTraceBackend } from '../../services';
import { useDebugSettingsStore } from '../../stores';

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
            logger.debug('APP', `SetDebugMode received from web: ${enabled}`);
            setDebugModeEnabled(enabled);
            return {
                type: 'OnSetDebugMode' as const,
                success: true,
                data: { enabled },
            };
        },
        [setDebugModeEnabled]
    );

    const handleFetchBootRecords = useCallback(async (_message: WebMessageData<'FetchBootRecords'>) => {
        try {
            const records = await bootMetricsService.getRecords();
            return {
                type: 'OnFetchBootRecords' as const,
                success: true,
                data: {
                    records,
                    contentProcessReloadCount: bootMetricsService.getContentProcessReloadCount(),
                    lastForegroundResumeMs: bootMetricsService.getLastForegroundResumeMs(),
                },
            };
        } catch (e: any) {
            logger.error('APP', 'FetchBootRecords error', e as Error);
            return {
                type: 'OnFetchBootRecords' as const,
                success: false,
                error: { code: 'BOOT_RECORDS_ERROR', message: e.message },
            };
        }
    }, []);

    const handleClearBootRecords = useCallback(async (_message: WebMessageData<'ClearBootRecords'>) => {
        try {
            await bootMetricsService.clearRecords();
            return {
                type: 'OnClearBootRecords' as const,
                success: true,
                data: { success: true },
            };
        } catch (e: any) {
            logger.error('APP', 'ClearBootRecords error', e as Error);
            return {
                type: 'OnClearBootRecords' as const,
                success: false,
                error: { code: 'BOOT_RECORDS_ERROR', message: e.message },
            };
        }
    }, []);

    const handleStartPerfTrace = useCallback(async (message: WebMessageData<'StartPerfTrace'>) => {
        const { id, name } = message.data;
        if (isValidPerfTraceName(name)) perfTraceBackend.start({ id, name: name as PerfTraceName });
        return { type: 'OnStartPerfTrace' as const, success: true, data: {} };
    }, []);

    const handleStopPerfTrace = useCallback(async (message: WebMessageData<'StopPerfTrace'>) => {
        const { id, name, attributes, metrics } = message.data;
        if (isValidPerfTraceName(name)) {
            perfTraceBackend.stop({ id, name: name as PerfTraceName, durationMs: 0, attributes, metrics });
        }
        return { type: 'OnStopPerfTrace' as const, success: true, data: {} };
    }, []);

    return {
        handleSendBootMetrics,
        handleSetDebugMode,
        handleFetchBootRecords,
        handleClearBootRecords,
        handleStartPerfTrace,
        handleStopPerfTrace,
    };
};
