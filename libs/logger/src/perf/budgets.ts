import type { PerfBudget, PerfMetricName } from './types';

/**
 * The performance budget, as data.
 *
 * `Record<PerfMetricName, PerfBudget>` will not compile if a metric is missing
 * a budget, so the scenario list and the targets cannot drift apart. This is the
 * runtime source of truth for the numbers documented in `docs/perf-metrics.md`.
 *
 * FCP/LCP are judged at p75 because their thresholds were defined at p75; the
 * app scenarios use p95 so the tail is answered for.
 */
export const PERF_BUDGETS: Record<PerfMetricName, PerfBudget> = {
    boot: { ms: 1_500, stat: 'p95' },
    'cloud-switch': { ms: 1_000, stat: 'p95' },
    'site-switch': { ms: 1_000, stat: 'p95' },
    fcp: { ms: 1_800, stat: 'p75' },
    lcp: { ms: 2_500, stat: 'p75' },
};

/**
 * Where a reporter looks up the target it is judging against.
 *
 * An interface rather than a direct import so the targets can come from
 * somewhere else without touching the reporter — a build that tightens them for
 * a canary, or a test that wants round numbers. The default is static, which is
 * the honest shape for values that only change when someone edits them.
 */
export interface PerfBudgetCatalog {
    budgetFor(metric: PerfMetricName): PerfBudget;
}

/** The catalog backed by a plain record; `PERF_BUDGETS` unless told otherwise. */
export class StaticPerfBudgetCatalog implements PerfBudgetCatalog {
    constructor(private readonly budgets: Record<PerfMetricName, PerfBudget> = PERF_BUDGETS) {}

    public budgetFor(metric: PerfMetricName): PerfBudget {
        return this.budgets[metric];
    }
}
