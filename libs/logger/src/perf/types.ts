/**
 * The five scenarios that carry a performance budget (ADR-0071).
 *
 * A closed union on purpose, unlike `tag` which is deliberately open: a budget
 * only means something if the endpoints are pinned, and every name here has a
 * row in `PERF_BUDGET_MS` that the compiler enforces.
 */
export type PerfMetricName = 'boot' | 'cloud-switch' | 'site-switch' | 'fcp' | 'lcp';

/**
 * What rides in a metric entry's `data`.
 *
 * The numbers live here rather than in the message text: `message` is written
 * for a person reading the log monitor, this is written for the script that
 * computes the distribution. One string cannot serve both readers without one
 * of them losing.
 */
export interface PerfMetricData {
    metric: PerfMetricName;
    /** Measured duration in ms, rounded — sub-ms precision is noise at this scale. */
    ms: number;
    budgetMs: number;
    /**
     * Whether THIS ONE sample exceeded the budget — not the verdict.
     *
     * The verdict is p95 (scenarios) / p75 (web vitals) and is computed offline,
     * because the value sits inside a `data` string the server cannot aggregate
     * on. Derivable from `ms`/`budgetMs`, and carried anyway: a substring search
     * for `"overBudget":true` is the one cheap server-side filter this design
     * leaves available.
     */
    overBudget: boolean;
    /**
     * Whether the measured operation succeeded. Set by the switch metrics only.
     *
     * Failures are reported rather than skipped: a switch that was slow enough
     * to fail is exactly the sample that shapes the tail, and dropping those
     * would bias the distribution optimistic.
     */
    ok?: boolean;
    /** Intermediate milestones, in ms on the same baseline as `ms`. Boot only. */
    marks?: Record<string, number>;
    /**
     * Which kind of boot this was. Boot only.
     *
     * The budget is defined on `cold` — baseline is provider construction. A
     * `reload` session re-baselines on a WebView content-process crash, so it
     * measures a different thing, and it happens disproportionately on
     * memory-pressured devices: exactly the population that shapes the tail.
     * Mixing the two silently would make the boot p95 answer a question nobody
     * asked, so the sample says which it is and the analysis filters.
     */
    bootType?: 'cold' | 'reload';
    /**
     * Entries this run has lost to queue backpressure so far, cumulative.
     *
     * Absent when nothing has been dropped. Cumulative rather than a delta so a
     * metric entry that is itself dropped does not take the count with it — the
     * last surviving entry still reports the total.
     */
    dropped?: number;
}
