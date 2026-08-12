import { isNative, logger } from '@chatic/bridges';
import { reportError } from '@chatic/web-core';
import type { ErrorCategory } from '@chatic/web-core';
import type { PendingReportInfo } from '@chatic/app-messages';

import { appBridge } from '../bridge';
import { toLogEntry } from '../bridge/nativeLogSource';

/** Settle delay past window load so the session bootstrap can sign requests. */
const FLUSH_DELAY_MS = 3_000;

/** Categories the native queue is allowed to relay (anything else → unknown). */
const RELAYED_CATEGORIES: ReadonlySet<string> = new Set(['webview-crash', 'native-error', 'native-crash']);

const toCategory = (category: string): ErrorCategory =>
    (RELAYED_CATEGORIES.has(category) ? category : 'unknown') as ErrorCategory;

const relayReport = async (report: PendingReportInfo): Promise<void> => {
    const error = new Error(report.message ?? report.category);
    // The queued JS stack (native-error) is the real one; without it the
    // synthetic stack here would point at this relay — drop it (P1 honesty).
    error.stack = report.stack;
    await reportError(error, {
        source: 'pending-report',
        categoryOverride: toCategory(report.category),
        logsOverride: (report.logs ?? []).map(toLogEntry),
        occurredAt: report.detectedAt,
    });
};

/**
 * Relays the native side's deferred reports through the signed web reporter
 * (ADR-0047): the `/hello/report` token lives only in the web session, so
 * WebView crashes / RN exceptions / native crashes queue in MMKV and flush
 * here once the web boots. Relayed ids are acknowledged so the queue never
 * re-sends them — reports throttled as duplicates within this flush are
 * acknowledged too (they ARE duplicates).
 */
export const schedulePendingReportFlush = (): void => {
    if (!isNative()) return;

    const flush = async (): Promise<void> => {
        try {
            const response = await appBridge.fetchPendingReports();
            const reports = response.success ? (response.data?.reports ?? []) : [];
            if (!reports.length) return;

            const relayedIds: string[] = [];
            for (const report of reports) {
                try {
                    await relayReport(report);
                    relayedIds.push(report.id);
                } catch (relayError) {
                    // Leave the id unacked — the next boot retries it.
                    logger.warn('ERROR_REPORT', '[PendingReports] relay failed', { id: report.id, relayError });
                }
            }
            if (relayedIds.length) {
                await appBridge.ackPendingReports(relayedIds);
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
