import { useCallback } from 'react';

import type { WebMessageData } from '@chatic/app-messages';
import { isPerfTraceName } from '@chatic/perf';

import { bootMetricsService, logger, perfTraceBackend } from '../../services';
import { useDebugSettingsStore } from '../../stores';

/**
 * Handles perf/debug bridge messages from the web:
 * - SendBootMetrics: merge the web boot snapshot into the current boot record.
 * - SetDebugMode: persist the unlock flag so the native debug overlay opens in
 *   PROD builds too (single 10-tap unlock covers both layers).
 * - FetchBootRecords / ClearBootRecords: read back and drop what the native side recorded. Added
 *   for ADR-0080 Decision 11 — the Boot Performance screen moves to the web, and `SendBootMetrics`
 *   only goes web → app, so there was no way to read the merged records.
 * - StartPerfTrace / StopPerfTrace: open and close a Firebase Performance trace for the web. The
 *   SDK exists only on this side, and it times a trace itself, so the web forwards the two ends of
 *   a measurement as they happen instead of a finished number.
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
        // The name is a plain string on the wire so the contracts package does not depend on
        // `@chatic/perf`. Checked here, so no sender can open a trace row nobody configured.
        if (isPerfTraceName(name)) perfTraceBackend.start({ id, name });
        return { type: 'OnStartPerfTrace' as const, success: true, data: {} };
    }, []);

    const handleStopPerfTrace = useCallback(async (message: WebMessageData<'StopPerfTrace'>) => {
        const { id, name, attributes, metrics } = message.data;
        // `durationMs` is the web's own measurement; Firebase timed this trace itself.
        if (isPerfTraceName(name)) perfTraceBackend.stop({ id, name, durationMs: 0, attributes, metrics });
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
