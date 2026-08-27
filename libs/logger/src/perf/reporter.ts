import { PERF_BUDGET_MS } from './budgets';
import { PERF_SAMPLE_PERCENT, isSampledRun } from './sampling';

import type { Logger } from '../core/types';
import type { PerfMetricData, PerfMetricName } from './types';

/**
 * The metric emitter and the single place this package assembles one.
 *
 * Same shape as `CoreLogger` + `runtime.ts`: a class that takes its
 * collaborators as arguments and can be built standalone, plus one holder that
 * the free functions below delegate through. Instrumentation points — a site
 * switch, a web-vitals callback, a boot finalizer — sit in unrelated code and
 * cannot be handed an instance without threading one through every layer above
 * them, so the holder is what they talk to.
 *
 * "Off by default" is structural rather than a condition somewhere: the
 * instrumentation sits in shared libs that `apps/desktop-web` and plain browser
 * sessions also load, and anything gated by a flag eventually gets the flag
 * wrong. A host that never calls `configurePerfMetrics` has no reporter, so
 * every call below returns immediately.
 *
 * The logger arrives as an argument rather than being imported from
 * `runtime.ts`: this package keeps exactly one composition root and nothing
 * else reaches for the singleton.
 */

export interface PerfMetricsConfig {
    /** Where metric entries are published. Hosts pass the shared `logger`. */
    logger: Logger;
    /**
     * This app run's id — the same value the native shell injects into the
     * WebView. Absent (or unsampled) leaves metrics off.
     */
    runId: string | undefined;
    /** Overrides `PERF_SAMPLE_PERCENT`. Tests pin it; production does not pass it. */
    samplePercent?: number;
}

export interface PerfMetricOptions {
    /**
     * Intermediate milestones on the same baseline as the duration. Boot only.
     *
     * Accepts unset milestones so a caller can hand over its partial map as-is;
     * they are dropped rather than serialized as keys with no value.
     */
    marks?: Record<string, number | undefined>;
    /** Which kind of boot produced this sample. Boot only — see `PerfMetricData`. */
    bootType?: 'cold' | 'reload';
    /** Whether the measured operation succeeded. Switch metrics only. */
    ok?: boolean;
}

/** Keeps only the milestones that were actually reached. */
const measuredMarks = (marks: Record<string, number | undefined>): Record<string, number> => {
    const kept: Record<string, number> = {};

    for (const [key, value] of Object.entries(marks)) {
        if (typeof value === 'number' && Number.isFinite(value)) kept[key] = value;
    }

    return kept;
};

/**
 * Turns measurements into `info` / `PERF` entries, and remembers what the
 * upload queue lost along the way.
 *
 * The drop total lives here rather than in a module of its own because it is
 * only ever read to be attached to a metric — keeping it outside made the
 * emitter's output depend on state its constructor never mentioned. Cumulative
 * and never consumed: a delta would vanish with the very entry carrying it,
 * whereas a running total survives in whichever entry gets through.
 */
export class PerfMetricReporter {
    private droppedTotal = 0;

    constructor(private readonly logger: Logger) {}

    /**
     * Records entries lost to queue backpressure, so a distribution can be read
     * knowing how much of it was filtered away.
     *
     * `info` is dropped right after `debug` when the queue fills. That ordering
     * is correct — diagnostics should outrank measurements — but it is not
     * random: a device that logs a lot fills the queue, and such devices are
     * generally the slow ones, so the samples that make the p95 go first and the
     * distribution reads optimistic.
     *
     * A plain integer add is all this may ever do. It is called from inside
     * `queue.push`, which runs inside a hub publish — anything that logs there
     * re-enters and recurses (unified-logging principle 8).
     */
    public noteQueueDrops(count: number): void {
        if (count > 0) this.droppedTotal += count;
    }

    /** Publishes one metric. */
    public report(metric: PerfMetricName, ms: number, options: PerfMetricOptions = {}): void {
        // A clock that went backwards, or an unmeasured value, is not a sample.
        if (!Number.isFinite(ms) || ms < 0) return;

        const rounded = Math.round(ms);
        const budgetMs = PERF_BUDGET_MS[metric];
        const marks = options.marks ? measuredMarks(options.marks) : undefined;

        const data: PerfMetricData = {
            metric,
            ms: rounded,
            budgetMs,
            overBudget: rounded > budgetMs,
            ...(options.ok === undefined ? {} : { ok: options.ok }),
            ...(options.bootType ? { bootType: options.bootType } : {}),
            ...(marks && Object.keys(marks).length > 0 ? { marks } : {}),
            ...(this.droppedTotal > 0 ? { dropped: this.droppedTotal } : {}),
        };

        // The message is for a person scanning the log monitor; the numbers that
        // get parsed are in `data` (principle: no numbers inside prose).
        this.logger.info('PERF', `${metric} ${rounded}ms`, data);
    }
}

/** The reporter for this run, present only while the run is sampled. */
let reporter: PerfMetricReporter | undefined;

/**
 * Turns metric reporting on for this run, if the run is sampled.
 *
 * The sample decision is taken once, here, rather than per report: `runId` is
 * fixed for the process, so re-deciding would spend a hash per metric to reach
 * the same answer.
 *
 * Call this before anything that can report or drop — the reporter owns the
 * drop total, so entries lost before it exists are not counted. On the web that
 * means ahead of the log uploader, whose queue can evict on restore.
 */
export const configurePerfMetrics = ({ logger, runId, samplePercent }: PerfMetricsConfig): void => {
    reporter = isSampledRun(runId, samplePercent ?? PERF_SAMPLE_PERCENT) ? new PerfMetricReporter(logger) : undefined;
};

/** Test seam, and the way a host turns reporting back off. */
export const resetPerfMetrics = (): void => {
    reporter = undefined;
};

/** Whether this run is sampled and reporting. */
export const isPerfMetricsEnabled = (): boolean => reporter !== undefined;

/**
 * Publishes one metric as an `info` / `PERF` entry.
 *
 * A no-op on an unsampled or unconfigured run — call sites do not check first,
 * which is what keeps the instrumentation to one line each.
 */
export const reportPerfMetric = (metric: PerfMetricName, ms: number, options: PerfMetricOptions = {}): void =>
    reporter?.report(metric, ms, options);

/** Records entries the upload queue dropped under backpressure. */
export const noteQueueDrops = (count: number): void => reporter?.noteQueueDrops(count);
