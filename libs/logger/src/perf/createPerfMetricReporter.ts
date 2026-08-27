import { BudgetedPerfMetricReporter, NOOP_PERF_METRIC_REPORTER } from './PerfMetricReporter';
import { StaticPerfBudgetCatalog } from './budgets';
import { PERF_SAMPLE_PERCENT, isSampledRun } from './sampling';

import type { PerfBudgetCatalog } from './budgets';
import type { PerfMetricReporter } from './PerfMetricReporter';
import type { PerfMetricSink } from './PerfMetricSink';

export interface PerfMetricReporterOptions {
    /** Where finished records go. The only piece a host must decide. */
    sink: PerfMetricSink;
    /**
     * This app run's id — the same value the native shell injects into the
     * WebView. Absent (or unsampled) yields the no-op reporter.
     */
    runId: string | undefined;
    /** Overrides `PERF_SAMPLE_PERCENT`. Tests pin it; production does not pass it. */
    samplePercent?: number;
    /** Overrides the shipped targets. Defaults to `PERF_BUDGETS`. */
    budgets?: PerfBudgetCatalog;
}

/**
 * Builds the reporter for one run — the single place the parts meet.
 *
 * Sampling is decided here and nowhere else. That is what lets the rest of the
 * module contain no `if (sampled)` at all: an unsampled run is not a reporter
 * with a flag set, it is the no-op reporter, and every call site downstream is
 * written as though metrics were always on.
 *
 * The verdict is taken once, at construction, rather than per report: `runId` is
 * fixed for the process, so re-deciding would spend a hash per metric to reach
 * the same answer.
 */
export const createPerfMetricReporter = ({
    sink,
    runId,
    samplePercent,
    budgets,
}: PerfMetricReporterOptions): PerfMetricReporter => {
    if (!isSampledRun(runId, samplePercent ?? PERF_SAMPLE_PERCENT)) return NOOP_PERF_METRIC_REPORTER;

    return new BudgetedPerfMetricReporter(sink, budgets ?? new StaticPerfBudgetCatalog());
};
