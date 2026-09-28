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
 * Only the two with a target. CLS and TTFB have none. INP is deliberately
 * absent even though it has a reference target: it keeps being revised for the
 * lifetime of the page, and in a WebView SPA that lifetime is the whole app
 * session — there is no moment at which the value is final, so every revision
 * would become another sample for the same session. It stays local (the overlay
 * below still receives it) until a settling point is decided.
 *
 * A sample rather than a timed trace: the browser reports the value after the
 * fact, so it rides in `value_ms` and the trace's own duration means nothing.
 */
const RECORDED_VITALS: Partial<Record<Metric['name'], string>> = {
    FCP: 'fcp',
    LCP: 'lcp',
};

export const receiveVital = (metric: Metric): void => {
    // The debug overlay takes every vital, budget or not.
    reportVital(metric.name, metric.value, metric.rating);

    const vital = RECORDED_VITALS[metric.name];
    if (vital) recordPerfSample('web_vitals', { attributes: { vital }, metrics: { value_ms: metric.value } });
};
