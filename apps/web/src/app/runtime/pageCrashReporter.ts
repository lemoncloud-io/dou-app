import { reportError } from '@chatic/web-core';
import type { WebLogBootResult } from './webLogPersistence';

/**
 * Settle delay past window load so the session/transport bootstrap (guest
 * boot included) is ready to sign the report request.
 */
const REPORT_DELAY_MS = 3_000;

/**
 * Sends the previous session's page-crash report (ADR-0047 S7): the sentinel
 * says the last session in this tab died without a clean pagehide, and its
 * persisted buffer rides along as the breadcrumb. The report's timestamp is
 * the last persisted entry's occurrence time — the closest approximation of
 * when the session died.
 */
export const schedulePageCrashReport = (boot: WebLogBootResult): void => {
    if (!boot.crashedLastSession) return;

    const send = (): void => {
        const lastEntry = boot.previousEntries.at(-1);
        void reportError(new Error('Previous session ended without a clean exit (page crash/kill)'), {
            source: 'page-crash-sentinel',
            categoryOverride: 'page-crash',
            logsOverride: boot.previousEntries,
            occurredAt: lastEntry?.timestamp || undefined,
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
