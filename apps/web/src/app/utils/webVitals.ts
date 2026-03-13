import { onCLS, onFCP, onINP, onLCP, onTTFB } from 'web-vitals';

import type { Metric } from 'web-vitals';

type ReportHandler = (metric: Metric) => void;

/**
 * Reports Web Vitals metrics.
 * In production, you can send these to an analytics endpoint.
 */
const reportMetric: ReportHandler = (metric: Metric) => {
    // Log to console in development
    if (process.env.NODE_ENV !== 'production') {
        console.log('[WebVitals]', metric.name, metric.value.toFixed(2), metric.rating);
    }

    // In production, send to analytics
    // Example: sendToAnalytics(metric);
};

/**
 * Initialize Web Vitals monitoring.
 * Call this once in your app entry point.
 */
export const initWebVitals = () => {
    // Largest Contentful Paint - measures loading performance
    // Good: < 2.5s, Needs Improvement: 2.5s - 4s, Poor: > 4s
    onLCP(reportMetric);

    // First Contentful Paint - measures when first content appears
    onFCP(reportMetric);

    // Interaction to Next Paint - measures responsiveness (replaces FID)
    // Good: < 200ms, Needs Improvement: 200ms - 500ms, Poor: > 500ms
    onINP(reportMetric);

    // Cumulative Layout Shift - measures visual stability
    // Good: < 0.1, Needs Improvement: 0.1 - 0.25, Poor: > 0.25
    onCLS(reportMetric);

    // Time to First Byte - measures server response time
    onTTFB(reportMetric);
};
