import { ingestLogEntry, logger } from '@chatic/bridges';
import type { PendingReportInfo } from '@chatic/bridge-messages';
import { runtime } from '@chatic/runtime';

const FLUSH_DELAY_MS = 3_000;

const RELAYED_CATEGORIES: ReadonlySet<string> = new Set(['webview-crash', 'native-error', 'native-crash']);

const toCategory = (category: string): string => (RELAYED_CATEGORIES.has(category) ? category : 'unknown');

const relayReport = (report: PendingReportInfo): void => {
    const error = new Error(report.message ?? report.category);
    error.stack = report.stack;

    ingestLogEntry({
        level: 'error',
        tag: 'GLOBAL',
        message: `[${toCategory(report.category)}] ${report.message ?? report.category}`,
        error,
        timestamp: report.detectedAt,
        source: 'native',
    });
};

export const schedulePendingReportFlush = (): void => {
    const { pendingReports } = runtime.diagnostics;
    if (!pendingReports) return;

    const flush = async (): Promise<void> => {
        try {
            const reports = await pendingReports.fetch();
            if (!reports.length) return;

            const relayedIds: string[] = [];
            for (const report of reports) {
                try {
                    relayReport(report);
                    relayedIds.push(report.id);
                } catch (relayError) {
                    logger.warn('ERROR_REPORT', '[PendingReports] relay failed', { id: report.id, relayError });
                }
            }
            if (relayedIds.length) {
                await pendingReports.ack(relayedIds);
            }
        } catch (flushError) {
            logger.warn('ERROR_REPORT', '[PendingReports] flush failed', { flushError });
        }
    };

    const schedule = (): void => {
        setTimeout(() => void flush(), FLUSH_DELAY_MS);
    };
    if (document.readyState === 'complete') {
        schedule();
    } else {
        window.addEventListener('load', schedule, { once: true });
    }
};
