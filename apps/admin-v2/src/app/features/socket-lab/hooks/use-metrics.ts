/**
 * `hooks/use-metrics.ts`
 */
import { useEffect, useState } from 'react';
import type { E2ECollector, MetricsSummary } from '../metrics/e2e-collector';

export const useMetrics = (collector: E2ECollector): MetricsSummary => {
    const [summary, setSummary] = useState<MetricsSummary>(() => collector.summary());
    useEffect(() => {
        setSummary(collector.summary());
        return collector.subscribe(() => setSummary(collector.summary()));
    }, [collector]);
    return summary;
};
