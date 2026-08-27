import { PERF_BUDGET_MS } from './budgets';
import { readQueueDropTotal } from './dropCounter';
import { PERF_SAMPLE_PERCENT, isSampledRun } from './sampling';

import type { Logger } from '../core/types';
import type { PerfMetricData, PerfMetricName } from './types';

/**
 * The metric emitter, off until a host turns it on.
 *
 * "Off by default" is structural here rather than a condition somewhere: the
 * instrumentation sits in shared libs that `apps/desktop-web` and plain browser
 * sessions also load, and anything gated by a flag eventually gets the flag
 * wrong. A host that never calls `configurePerfMetrics` has no emitter, so
 * every `reportPerfMetric` call in those builds returns immediately.
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

/** The emitter, present only while this run is sampled. */
let active: Logger | undefined;

/**
 * Turns metric reporting on for this run, if the run is sampled.
 *
 * The sample decision is taken once, here, rather than per report: `runId` is
 * fixed for the process, so re-deciding would spend a hash per metric to reach
 * the same answer.
 */
export const configurePerfMetrics = ({ logger, runId, samplePercent }: PerfMetricsConfig): void => {
    active = isSampledRun(runId, samplePercent ?? PERF_SAMPLE_PERCENT) ? logger : undefined;
};

/** Test seam, and the way a host turns reporting back off. */
export const resetPerfMetrics = (): void => {
    active = undefined;
};

/** Whether this run is sampled and reporting. */
export const isPerfMetricsEnabled = (): boolean => active !== undefined;

/**
 * Publishes one metric as an `info` / `PERF` entry.
 *
 * A no-op on an unsampled or unconfigured run — call sites do not check first,
 * which is what keeps the instrumentation to one line each.
 */
export const reportPerfMetric = (metric: PerfMetricName, ms: number, options: PerfMetricOptions = {}): void => {
    const logger = active;
    if (!logger) return;
    // A clock that went backwards, or an unmeasured value, is not a sample.
    if (!Number.isFinite(ms) || ms < 0) return;

    const rounded = Math.round(ms);
    const budgetMs = PERF_BUDGET_MS[metric];
    const dropped = readQueueDropTotal();
    const marks = options.marks ? measuredMarks(options.marks) : undefined;

    const data: PerfMetricData = {
        metric,
        ms: rounded,
        budgetMs,
        overBudget: rounded > budgetMs,
        ...(options.ok === undefined ? {} : { ok: options.ok }),
        ...(options.bootType ? { bootType: options.bootType } : {}),
        ...(marks && Object.keys(marks).length > 0 ? { marks } : {}),
        ...(dropped > 0 ? { dropped } : {}),
    };

    // The message is for a person scanning the log monitor; the numbers that get
    // parsed are in `data` (principle: no numbers inside prose).
    logger.info('PERF', `${metric} ${rounded}ms`, data);
};
