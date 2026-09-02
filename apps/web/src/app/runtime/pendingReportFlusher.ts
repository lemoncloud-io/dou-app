import { ingestLogEntry, isNative, logger } from '@chatic/bridges';
import type { PendingReportInfo } from '@chatic/app-messages';

import { appBridge } from '../bridge';

/** Settle delay past window load, so the bridge is answering before we ask it. */
const FLUSH_DELAY_MS = 3_000;

/** Categories the native queue is allowed to relay (anything else → unknown). */
const RELAYED_CATEGORIES: ReadonlySet<string> = new Set(['webview-crash', 'native-error', 'native-crash']);

const toCategory = (category: string): string => (RELAYED_CATEGORIES.has(category) ? category : 'unknown');

/**
 * Turns one queued native report into a log entry.
 *
 * Uses `ingestLogEntry`, not `logger.error`, for one reason: these events
 * happened in a run that is already dead — often a previous launch. `logger`
 * stamps `timestamp` at dispatch, which would date a crash from last night to
 * this morning's boot and put it out of order against everything around it.
 * `ingest` preserves what it is given, so `detectedAt` survives.
 *
 * The dead run's `runId`/`sid`/`cid` are not reconstructable here and are left
 * unset rather than filled with this run's — a wrong `runId` is worse than a
 * missing one, because it silently folds the crash into the wrong run.
 *
 * `report.logs` is ignored on purpose: those entries are in the native merged
 * buffer the uploader already drains, so relaying them would store a second
 * copy of logs the collector has. Older shells keep sending the field; nothing
 * reads it.
 */
const relayReport = (report: PendingReportInfo): void => {
    const error = new Error(report.message ?? report.category);
    // The queued JS stack (native-error) is the real one; without it the
    // synthetic stack here would point at this relay — drop it (P1 honesty).
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

/**
 * Drains the native side's deferred report queue into the log pipeline: WebView
 * crashes / RN exceptions / native crashes are detected while the web is gone
 * or dying, so they queue in MMKV and flush here once the web boots. Relayed
 * ids are acknowledged so the queue never re-sends them.
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
                    relayReport(report);
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
