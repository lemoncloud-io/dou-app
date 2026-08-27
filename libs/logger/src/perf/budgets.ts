import type { PerfMetricName } from './types';

/**
 * The performance budget, as data.
 *
 * This is the runtime source of truth for the numbers documented in
 * `docs/perf-metrics.md`; `Record<PerfMetricName, …>` will not compile if a
 * metric is missing a budget, so the two cannot drift apart.
 */
export const PERF_BUDGET_MS: Record<PerfMetricName, number> = {
    boot: 1_500,
    'cloud-switch': 1_000,
    'site-switch': 1_000,
    fcp: 1_800,
    lcp: 2_500,
};

/** Which statistic decides whether a budget is met. */
export type PerfBudgetStat = 'p95' | 'p75';

/**
 * The statistic each budget is judged on.
 *
 * Not sent over the wire — it is constant per metric, so the offline analysis
 * reads it from here rather than paying for it on every entry. FCP/LCP use p75
 * because their thresholds were defined at p75; the app scenarios use p95 so
 * the tail is answered for.
 */
export const PERF_BUDGET_STAT: Record<PerfMetricName, PerfBudgetStat> = {
    boot: 'p95',
    'cloud-switch': 'p95',
    'site-switch': 'p95',
    fcp: 'p75',
    lcp: 'p75',
};
