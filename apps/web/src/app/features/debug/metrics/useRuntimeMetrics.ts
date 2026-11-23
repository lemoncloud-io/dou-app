import { useSyncExternalStore } from 'react';

import { metricsCollector, type MetricsSnapshot } from './MetricsCollector';

export const useRuntimeMetrics = (): MetricsSnapshot =>
    useSyncExternalStore(metricsCollector.subscribe, metricsCollector.getSnapshot);
