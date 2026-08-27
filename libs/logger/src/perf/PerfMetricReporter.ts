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
 * Turns measurements into records judged against a budget.
 *
 * Stateless, and deliberately incurious about what happens to a record after
 * the sink takes it. Measuring and writing down is the whole job: the entry
 * then travels the ordinary log path — hub, listeners, store — and the uploader
 * pulls from that store on its own schedule. Nothing here knows the transport
 * exists, which is what keeps the module graph one-directional.
 */
export class BudgetedPerfMetricReporter implements PerfMetricReporter {
    constructor(
        private readonly sink: PerfMetricSink,
        private readonly budgets: PerfBudgetCatalog
    ) {}

    public report(metric: PerfMetricName, ms: number, options: PerfMetricOptions = {}): void {
        // A clock that went backwards, or an unmeasured value, is not a sample.
        if (!Number.isFinite(ms) || ms < 0) return;

        const rounded = Math.round(ms);
        const budget = this.budgets.budgetFor(metric);
        const marks = options.marks ? measuredMarks(options.marks) : undefined;

        this.sink.emit({
            metric,
            ms: rounded,
            budgetMs: budget.ms,
            overBudget: rounded > budget.ms,
            ...(options.ok === undefined ? {} : { ok: options.ok }),
            ...(options.bootType ? { bootType: options.bootType } : {}),
            ...(marks && Object.keys(marks).length > 0 ? { marks } : {}),
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
