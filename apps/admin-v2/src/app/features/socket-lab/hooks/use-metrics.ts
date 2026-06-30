/**
 * `hooks/use-metrics.ts`
 * - collector(rAF 배치 통지) 구독 → summary 1회 setState. 고빈도 샘플도 프레임당 1리렌더.
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
