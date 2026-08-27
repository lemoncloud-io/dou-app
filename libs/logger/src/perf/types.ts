/**
 * The five scenarios that carry a performance budget (ADR-0071).
 *
 * A closed union on purpose, unlike `tag` which is deliberately open: a budget
 * only means something if the endpoints are pinned, and every name here must
 * have a row in the budget catalog for the compiler to be satisfied.
 */
export type PerfMetricName = 'boot' | 'cloud-switch' | 'site-switch' | 'fcp' | 'lcp';

/** Which statistic decides whether a budget is met. */
export type PerfBudgetStat = 'p95' | 'p75';

/**
 * One scenario's target.
 *
 * The threshold and the statistic travel together because neither answers the
 * question alone — "1.5s" means nothing until you know it is judged at p95.
 * They used to be two parallel records that had to be kept in step by hand.
 */
export interface PerfBudget {
    ms: number;
    stat: PerfBudgetStat;
}

/** What a call site may attach to a measurement beyond its duration. */
export interface PerfMetricOptions {
    /**
     * Intermediate milestones on the same baseline as the duration. Boot only.
     *
     * Accepts unset milestones so a caller can hand over its partial map as-is;
     * they are dropped rather than serialized as keys with no value.
     */
    marks?: Record<string, number | undefined>;
    /** Which kind of boot produced this sample. Boot only — see `PerfMetricRecord`. */
    bootType?: 'cold' | 'reload';
    /** Whether the measured operation succeeded. Switch metrics only. */
    ok?: boolean;
}

/**
 * One finished measurement, before any sink decides how to encode it.
 *
 * This is the seam ADR-0071 forecast: today a sink turns it into an `info`
 * entry, and when the sample volume outgrows offline aggregation the same
 * record goes to a dedicated endpoint instead. Nothing here mentions logging.
 */
export interface PerfMetricRecord {
    metric: PerfMetricName;
    /** Measured duration in ms, rounded — sub-ms precision is noise at this scale. */
    ms: number;
    budgetMs: number;
    /**
     * Whether THIS ONE sample exceeded the budget — not the verdict.
     *
     * The verdict is the budget's `stat` (p95 / p75) and is computed offline,
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
    /** Intermediate milestones, in ms on the same baseline as `ms`. Boot only. */
    marks?: Record<string, number>;
}
