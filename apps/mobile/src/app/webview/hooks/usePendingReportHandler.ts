import { useCallback } from 'react';
import { useServices } from '../../hooks';
import type { WebMessageData } from '@chatic/app-messages';

/**
 * Bridge handlers for the deferred report queue (ADR-0047): the web pulls
 * queued native detections (`FetchPendingReports`), relays them through the
 * signed web reporter, then acknowledges (`AckPendingReports`) so a report is
 * never relayed twice.
 */
export const usePendingReportHandler = () => {
    const { pendingReportQueueService, logService: logger } = useServices();

    const handleFetchPendingReports = useCallback(
        async (_message: WebMessageData<'FetchPendingReports'>) => {
            try {
                return {
                    type: 'OnFetchPendingReports' as const,
                    success: true,
                    data: { reports: pendingReportQueueService.list() },
                };
            } catch (e: any) {
                logger.error('GLOBAL', 'FetchPendingReports error', e);
                return {
                    type: 'OnFetchPendingReports' as const,
                    success: false,
                    error: { code: 'REPORT_ERROR', message: e.message },
                };
            }
        },
        [pendingReportQueueService, logger]
    );

    const handleAckPendingReports = useCallback(
        async (message: WebMessageData<'AckPendingReports'>) => {
            try {
                const size = pendingReportQueueService.ack(message.data.ids ?? []);
                return {
                    type: 'OnAckPendingReports' as const,
                    success: true,
                    data: { size },
                };
            } catch (e: any) {
                logger.error('GLOBAL', 'AckPendingReports error', e);
                return {
                    type: 'OnAckPendingReports' as const,
                    success: false,
                    error: { code: 'REPORT_ERROR', message: e.message },
                };
            }
        },
        [pendingReportQueueService, logger]
    );

    return {
        handleFetchPendingReports,
        handleAckPendingReports,
    };
};
