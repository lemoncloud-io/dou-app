import { recordPerfSample } from '@chatic/perf';

import { reportVital } from './webVitalsStore';

import type { Metric } from 'web-vitals';

const RECORDED_VITALS: Partial<Record<Metric['name'], string>> = {
    FCP: 'fcp',
    LCP: 'lcp',
    INP: 'inp',
    CLS: 'cls',
    TTFB: 'ttfb',
};

const valueOf = (metric: Metric): number => (metric.name === 'CLS' ? metric.value * 1000 : metric.value);

export const receiveVital = (metric: Metric): void => {
    reportVital(metric.name, metric.value, metric.rating);

    const vital = RECORDED_VITALS[metric.name];
    if (vital) recordPerfSample('web_vitals', { attributes: { vital }, metrics: { value_ms: valueOf(metric) } });
};
