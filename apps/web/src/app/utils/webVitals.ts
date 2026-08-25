import { onCLS, onFCP, onINP, onLCP, onTTFB } from 'web-vitals';

import { logger } from '@chatic/bridges';
import type { Metric } from 'web-vitals';

import { reportVital } from './webVitalsStore';

const reportMetric = (metric: Metric) => {
    // Always feed the debug overlay store; the log line stays dev-only.
    reportVital(metric.name, metric.value, metric.rating);
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
