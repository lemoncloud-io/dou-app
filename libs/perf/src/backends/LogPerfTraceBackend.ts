import { isSampledRun } from '../sampling';

import type { Logger } from '@chatic/logger';
import type { PerfTraceBackend } from '../PerfTrace';
import type { PerfTraceResult } from '../types';

/** Tag every trace entry carries, so `tag=PERF` is the whole server-side filter. */
export const PERF_LOG_TAG = 'PERF';

export interface LogPerfTraceBackendOptions {
    logger: Logger;
    /** This app run's id. Absent means never sampled — see `isSampledRun`. */
    runId: string | undefined;
    /** Overrides `PERF_SAMPLE_PERCENT`. Tests pin it; production does not pass it. */
    samplePercent?: number;
}

/**
 * Writes finished traces into the log pipeline as `info`/`PERF` entries.
 *
 * The fallback for a WebView running inside an app build that cannot record Firebase traces —
 * the web deploys ahead of the app, so for a while most sessions are exactly that. Keeping them
 * on the log pipe means the new traces (a room open, above all) start producing data the day the
 * web ships rather than the day the app update reaches most users.
 *
 * Sampled by run, like the metrics this replaces, because these entries compete with diagnostic
 * logs for the upload queue's budget, and Firebase traces do not. The verdict is taken once:
 * `runId` does not change within a process.
 *
 * `start` records nothing. Only a finished trace is a sample; a trace that never stops left
 * nothing to measure.
 */
export class LogPerfTraceBackend implements PerfTraceBackend {
    private readonly sampled: boolean;

    constructor(private readonly options: LogPerfTraceBackendOptions) {
        this.sampled = isSampledRun(options.runId, options.samplePercent);
    }

    public start(): void {
        // Nothing to do until the trace finishes.
    }

    public stop(result: PerfTraceResult): void {
        if (!this.sampled) return;
        // The prose is for someone scanning the log monitor; the numbers live in `data` only, so a
        // script parses JSON rather than a sentence. The id is left out: it pairs a start with a
        // stop on the device and means nothing once the entry exists.
        this.options.logger.info(PERF_LOG_TAG, `${result.name} ${result.durationMs}ms`, {
            trace: result.name,
            ms: result.durationMs,
            attributes: result.attributes,
            metrics: result.metrics,
        });
    }
}
