import { reportPerfMetric } from '@chatic/bridges';

import { reportVital } from './webVitalsStore';

import type { PerfMetricName } from '@chatic/bridges';
import type { Metric } from 'web-vitals';

/**
 * What happens to one `web-vitals` sample.
 *
 * Split out of `webVitals.ts`, which gates its dev log on `import.meta.env` and
 * is therefore unloadable under ts-jest's CommonJS transform (same reason
 * `buildEnv.ts` is its own module). Everything worth asserting lives here.
 */

/**
 * The vitals that carry a server-side budget (ADR-0071).
 *
 * Only two. CLS and TTFB have no budget in this track. INP is deliberately
 * absent even though it has a reference target: it keeps being revised for the
 * lifetime of the page, and in a WebView SPA that lifetime is the whole app
 * session — there is no moment at which the value is final, so every revision
 * would become another entry for the same session. It stays local (the overlay
 * below still receives it) until a settling point is decided.
 */
const BUDGETED_VITALS: Partial<Record<Metric['name'], PerfMetricName>> = {
    FCP: 'fcp',
    LCP: 'lcp',
};

export const receiveVital = (metric: Metric): void => {
    // The debug overlay takes every vital, budget or not.
    reportVital(metric.name, metric.value, metric.rating);

    const budgeted = BUDGETED_VITALS[metric.name];
    if (budgeted) reportPerfMetric(budgeted, metric.value);
};
