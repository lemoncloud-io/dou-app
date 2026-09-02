import { logger } from '@chatic/bridges';
import type { WebCrashSentinelResult } from './webCrashSentinel';

/**
 * Records that the previous session in this tab died without a clean pagehide
 * (ADR-0047 S7), as an ordinary `error` entry in this run's log queue.
 *
 * The dead run's own entries reached the collector on their own, stamped with
 * their own `runId`, so this entry's job is only to mark that the run ended
 * badly. It is deliberately stamped with the *current* run's context and time:
 * the crash was detected now, by this run, and the dead run's context is not
 * something this process can reconstruct. The two are correlated in admin by
 * `uid` + adjacency in time, the same way the report it replaced was.
 *
 * Nothing is scheduled or delayed any more. The report this replaced had to
 * wait for the session bootstrap to be able to *sign* a request; a log entry
 * only has to reach the queue, and `startLogUploader` is wired ahead of this
 * call in `main.tsx`.
 */
export const schedulePageCrashReport = (boot: WebCrashSentinelResult): void => {
    if (!boot.crashedLastSession) return;

    logger.error('GLOBAL', '[page-crash] Previous session ended without a clean exit (page crash/kill)');
};
