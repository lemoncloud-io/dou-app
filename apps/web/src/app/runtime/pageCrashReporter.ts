import { logger } from '@chatic/bridges';
import type { WebCrashSentinelResult } from './webCrashSentinel';

export const schedulePageCrashReport = (boot: WebCrashSentinelResult): void => {
    if (!boot.crashedLastSession) return;

    logger.error('GLOBAL', '[page-crash] Previous session ended without a clean exit (page crash/kill)');
};
