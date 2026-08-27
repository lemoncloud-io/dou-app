import { LoggerPerfMetricSink } from './PerfMetricSink';
import { NOOP_PERF_METRIC_REPORTER } from './PerfMetricReporter';
import { createPerfMetricReporter } from './createPerfMetricReporter';

import type { Logger } from '../core/types';
import type { PerfBudgetCatalog } from './budgets';
import type { PerfMetricReporter, QueueDropCountProvider } from './PerfMetricReporter';
import type { PerfMetricSink } from './PerfMetricSink';
import type { PerfMetricName, PerfMetricOptions } from './types';

/**
 * The process-wide reporter slot, and the free functions instrumentation points
 * call through.
 *
 * The same shape the package uses for logging itself (`runtime.ts` beside
 * `CoreLogger`): one assembled instance, and thin delegates so callers never
 * hold it. Instrumentation points — a site switch, a web-vitals callback, a boot
 * finalizer — sit in unrelated code and cannot be handed an instance without
 * threading one through every layer above them, so this slot is what they talk
 * to. Anything composing its own reporter uses `createPerfMetricReporter`
 * directly and never touches this.
 *
 * The slot starts at the no-op reporter and returns to it on reset, so "metrics
 * are off" is a value rather than an absence. A host that never calls
 * `configurePerfMetrics` — `apps/desktop-web`, `apps/testbed`, a plain browser
 * tab — is off by construction rather than by a flag someone has to get right.
 */

export interface PerfMetricsConfig {
    /** Publishes metrics as `info`/`PERF` entries. Hosts pass the shared `logger`. */
    logger: Logger;
    /** This app run's id — the value the native shell injects into the WebView. */
    runId: string | undefined;
    /** Overrides `PERF_SAMPLE_PERCENT`. Tests pin it; production does not pass it. */
    samplePercent?: number;
    /** Swap the destination — the seam ADR-0071 leaves for a dedicated endpoint. */
    sink?: PerfMetricSink;
    /** Swap the targets. Defaults to the shipped `PERF_BUDGETS`. */
    budgets?: PerfBudgetCatalog;
    /**
     * Reads what the upload queue has dropped this run.
     *
     * A thunk so the host can point at a queue that does not exist yet — the
     * figure is read when a metric is reported, long after both are wired, so
     * there is no ordering to get right in either direction.
     */
    droppedCount?: QueueDropCountProvider;
}

let reporter: PerfMetricReporter = NOOP_PERF_METRIC_REPORTER;

/**
 * Turns metric reporting on for this run, if the run is sampled.
 *
 * Order-free with respect to the uploader: the queue keeps its own drop total
 * from its own construction, and `droppedCount` is read at report time. Only
 * one ordering still matters, and it is the pipeline's own — nothing may report
 * before this runs, or the record lands nowhere.
 */
export const configurePerfMetrics = ({
    logger,
    runId,
    samplePercent,
    sink,
    budgets,
    droppedCount,
}: PerfMetricsConfig): void => {
    reporter = createPerfMetricReporter({
        sink: sink ?? new LoggerPerfMetricSink(logger),
        runId,
        samplePercent,
        budgets,
        droppedCount,
    });
};

/** Test seam, and the way a host turns reporting back off. */
export const resetPerfMetrics = (): void => {
    reporter = NOOP_PERF_METRIC_REPORTER;
};

/**
 * Publishes one metric.
 *
 * A no-op on an unsampled or unconfigured run — call sites do not check first,
 * which is what keeps the instrumentation to one line each.
 */
export const reportPerfMetric = (metric: PerfMetricName, ms: number, options?: PerfMetricOptions): void =>
    reporter.report(metric, ms, options);
