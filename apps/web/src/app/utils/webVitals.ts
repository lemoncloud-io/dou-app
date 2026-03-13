import { onCLS, onFCP, onINP, onLCP, onTTFB } from 'web-vitals';

import type { Metric } from 'web-vitals';

const reportMetric = (metric: Metric) => {
    if (process.env.NODE_ENV !== 'production') {
        console.log('[WebVitals]', metric.name, metric.value.toFixed(2), metric.rating);
    }
};

export const initWebVitals = () => {
    onLCP(reportMetric);
    onFCP(reportMetric);
    onINP(reportMetric);
    onCLS(reportMetric);
    onTTFB(reportMetric);
};
