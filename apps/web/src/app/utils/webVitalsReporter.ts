import { recordPerfSample } from '@chatic/perf';

import { reportVital } from './webVitalsStore';

import type { Metric } from 'web-vitals';

/**
 * What happens to one `web-vitals` sample.
 *
 * Split out of `webVitals.ts`, which gates its dev log on `import.meta.env` and
 * is therefore unloadable under ts-jest's CommonJS transform (same reason
 * `buildEnv.ts` is its own module). Everything worth asserting lives here.
 */

/**
 * The vitals recorded as `web_vitals` samples, keyed to their `vital` attribute.
 *
 * All five. FCP and LCP reach Firebase as they always have; INP, CLS and TTFB are
 * recorded on the log pipeline only (`@chatic/perf`'s catalogue keeps them away
 * from Firebase). INP and CLS keep being revised for the lifetime of the page,
 * which in a WebView SPA is the whole app session; `web-vitals` reports them when
 * the page is hidden, and that value — the one at that moment — is the sample.
 * A page hidden more than once can give more than one.
 *
 * A sample rather than a timed trace: the browser reports the value after the
 * fact, so it rides in `value_ms` and the trace's own duration means nothing.
 */
const RECORDED_VITALS: Partial<Record<Metric['name'], string>> = {
    FCP: 'fcp',
    LCP: 'lcp',
    INP: 'inp',
    CLS: 'cls',
    TTFB: 'ttfb',
};

/**
 * CLS is a unitless score (0.1 is "good"), and metrics are integers, so it is carried ×1000. The
 * others are milliseconds already.
 */
const valueOf = (metric: Metric): number => (metric.name === 'CLS' ? metric.value * 1000 : metric.value);

export const receiveVital = (metric: Metric): void => {
    // The debug overlay takes every vital, budget or not.
    reportVital(metric.name, metric.value, metric.rating);

    const vital = RECORDED_VITALS[metric.name];
    if (vital) recordPerfSample('web_vitals', { attributes: { vital }, metrics: { value_ms: valueOf(metric) } });
};
