import type { PerfBudgetCatalog } from './budgets';
import type { PerfMetricSink } from './PerfMetricSink';
import type { PerfMetricName, PerfMetricOptions, PerfMetricRecord } from './types';

/**
 * What instrumentation points talk to.
 *
 * Two methods, and they are the two things a call site can know: it measured
 * something, or the queue lost something. Everything else — whether this run is
 * sampled, what the target is, where the record goes — is behind here, which is
 * what keeps each instrumentation point one line long.
 */
export interface PerfMetricReporter {
    report(metric: PerfMetricName, ms: number, options?: PerfMetricOptions): void;
    noteQueueDrops(count: number): void;
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
    noteQueueDrops: () => undefined,
});

/**
 * Turns measurements into records, judged against a budget, and remembers what
 * the upload queue lost along the way.
 *
 * The drop total lives here rather than in a module of its own because it is
 * only ever read to be attached to a record — keeping it outside made the
 * output depend on state the constructor never mentioned. Cumulative and never
 * consumed: a delta would vanish with the very record carrying it, whereas a
 * running total survives in whichever one gets through.
 */
export class BudgetedPerfMetricReporter implements PerfMetricReporter {
    private droppedTotal = 0;

    constructor(
        private readonly sink: PerfMetricSink,
        private readonly budgets: PerfBudgetCatalog
    ) {}

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
            ...(this.droppedTotal > 0 ? { dropped: this.droppedTotal } : {}),
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
