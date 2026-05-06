import { onCLS, onFCP, onINP, onLCP, onTTFB } from 'web-vitals';

import { logger } from '@chatic/app-messages';
import type { Metric } from 'web-vitals';

const reportMetric = (metric: Metric) => {
    if (process.env.NODE_ENV !== 'production') {
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
