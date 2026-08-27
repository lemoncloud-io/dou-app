import type { PerfBudgetCatalog } from './budgets';
import type { PerfMetricSink } from './PerfMetricSink';
import type { PerfMetricName, PerfMetricOptions, PerfMetricRecord } from './types';

/**
 * What instrumentation points talk to.
 *
 * One method, because a call site knows exactly one thing: it measured
 * something. Whether this run is sampled, what the target is, how much the
 * transport has lost, where the record goes — all of it is behind here, which
 * is what keeps each instrumentation point one line long.
 */
export interface PerfMetricReporter {
    report(metric: PerfMetricName, ms: number, options?: PerfMetricOptions): void;
}

/**
 * Supplies the number of entries backpressure has eaten this run.
 *
 * A named function type rather than an object port, matching
 * `LogContextProvider`: one nullary read, and wrapping it would add a shape
 * without adding a contract.
 *
 * The reporter READS this and never advances it. Counting belongs to whatever
 * does the dropping — the upload queue owns its own statistic — and this is
 * only the seam that carries the number out, because a queue cannot log about
 * itself (unified-logging principles 8 and 11). Metrics are the carrier because
 * they are what the number changes the meaning of: losing a few diagnostic
 * lines is survivable, but a distribution whose losses are not random is a lie
 * (ADR-0071 §4).
 */
export type QueueDropCountProvider = () => number;

/**
 * The reporter for a run that is not sampled.
 *
 * A null object rather than an absent reporter, so nothing downstream needs an
 * optional call. "Off" is then a value the composition root can hand out, not a
 * condition every caller re-checks — and an unsampled run costs two empty calls.
 *
 * An object literal, not a class: it holds nothing, and the package promotes to
 * a class only what has state to keep.
 */
export const NOOP_PERF_METRIC_REPORTER: PerfMetricReporter = Object.freeze({
    report: () => undefined,
});

/**
 * Turns measurements into records judged against a budget, and stamps each one
 * with how much the transport has lost so far.
 *
 * Stateless: the drop figure is read from its source at report time rather than
 * accumulated here. That leaves counting where the dropping happens, and it
 * means this reporter can be built before or after the queue exists — there is
 * no wiring order to get right.
 *
 * `info` is evicted right after `debug` when the queue fills. That ordering is
 * correct — diagnostics should outrank measurements — but it is not random: a
 * device that logs a lot fills the queue, and such devices are generally the
 * slow ones, so the samples that make the p95 go first and the distribution
 * reads optimistic. Carrying the figure is what makes that readable.
 */
export class BudgetedPerfMetricReporter implements PerfMetricReporter {
    constructor(
        private readonly sink: PerfMetricSink,
        private readonly budgets: PerfBudgetCatalog,
        private readonly droppedCount: QueueDropCountProvider = () => 0
    ) {}

    public report(metric: PerfMetricName, ms: number, options: PerfMetricOptions = {}): void {
        // A clock that went backwards, or an unmeasured value, is not a sample.
        if (!Number.isFinite(ms) || ms < 0) return;

        const rounded = Math.round(ms);
        const budget = this.budgets.budgetFor(metric);
        const marks = options.marks ? measuredMarks(options.marks) : undefined;
        const dropped = this.droppedCount();

        this.sink.emit({
            metric,
            ms: rounded,
            budgetMs: budget.ms,
            overBudget: rounded > budget.ms,
            ...(options.ok === undefined ? {} : { ok: options.ok }),
            ...(options.bootType ? { bootType: options.bootType } : {}),
            ...(marks && Object.keys(marks).length > 0 ? { marks } : {}),
            ...(dropped > 0 ? { dropped } : {}),
        } satisfies PerfMetricRecord);
    }
}

/** Keeps only the milestones that were actually reached. */
const measuredMarks = (marks: Record<string, number | undefined>): Record<string, number> => {
    const kept: Record<string, number> = {};

    for (const [key, value] of Object.entries(marks)) {
        if (typeof value === 'number' && Number.isFinite(value)) kept[key] = value;
    }

    return kept;
};
