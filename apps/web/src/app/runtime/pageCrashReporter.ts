import { reportError } from '@chatic/web-core';
import type { WebCrashSentinelResult } from './webCrashSentinel';

/**
 * Settle delay past window load so the session/transport bootstrap (guest
 * boot included) is ready to sign the report request.
 */
const REPORT_DELAY_MS = 3_000;

/**
 * Sends the previous session's page-crash report (ADR-0047 S7): the sentinel
 * says the last session in this tab died without a clean pagehide.
 *
 * The report carries no logs. The dead session's entries reached the collector
 * on their own through the batch uploader, stamped with the same `runId`, so
 * the report's job is only to mark that the run ended badly — and the logs it
 * would have copied are both more complete and correctly timed on the server.
 * Losing the buffer also costs the death time, which used to come from the last
 * persisted entry: the report is stamped at send time instead, and the real
 * timeline is read off the run's uploaded entries.
 */
export const schedulePageCrashReport = (boot: WebCrashSentinelResult): void => {
    if (!boot.crashedLastSession) return;

    const send = (): void => {
        void reportError(new Error('Previous session ended without a clean exit (page crash/kill)'), {
            source: 'page-crash-sentinel',
            categoryOverride: 'page-crash',
        });
    };

    const schedule = (): void => {
        setTimeout(send, REPORT_DELAY_MS);
    };
    if (document.readyState === 'complete') {
        schedule();
    } else {
        window.addEventListener('load', schedule, { once: true });
    }
};
