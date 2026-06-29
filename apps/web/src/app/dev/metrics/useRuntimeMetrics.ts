import { useSyncExternalStore } from 'react';

import { metricsCollector, type MetricsSnapshot } from './MetricsCollector';

/** Subscribe to the web-side metrics snapshot (used by the monitoring overlay). */
export const useRuntimeMetrics = (): MetricsSnapshot =>
    useSyncExternalStore(metricsCollector.subscribe, metricsCollector.getSnapshot);
