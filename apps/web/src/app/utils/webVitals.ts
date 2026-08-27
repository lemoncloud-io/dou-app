import { onCLS, onFCP, onINP, onLCP, onTTFB } from 'web-vitals';

import { logger } from '@chatic/bridges';
import type { Metric } from 'web-vitals';

import { receiveVital } from './webVitalsReporter';

const reportMetric = (metric: Metric) => {
    // Overlay store + (for budgeted vitals) the server-bound metric event. Kept
    // in `webVitalsReporter` so it stays testable — this module reads
    // `import.meta.env` and cannot be loaded under the test transform.
    receiveVital(metric);
    if (import.meta.env.DEV) {
        logger.debug('WEB_VITALS', metric.name, {
            value: metric.value.toFixed(2),
            rating: metric.rating,
        });
    }
};

export const initWebVitals = () => {
    onLCP(reportMetric);
    onFCP(reportMetric);
    onINP(reportMetric);
    onCLS(reportMetric);
    onTTFB(reportMetric);
};
