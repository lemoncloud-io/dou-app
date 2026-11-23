import { NOOP_PERF_TRACE_BACKEND, createPerfTrace } from './PerfTrace';
import { perfNow } from './perfNow';
import { createPerfTraceId } from './traceId';

import type { PerfTrace, PerfTraceBackend } from './PerfTrace';
import type { PerfTraceName } from './types';

let backend: PerfTraceBackend = NOOP_PERF_TRACE_BACKEND;

export const configurePerfTraces = (next: PerfTraceBackend): void => {
    backend = next;
};

export const resetPerfTraces = (): void => {
    backend = NOOP_PERF_TRACE_BACKEND;
};

export const startPerfTrace = (name: PerfTraceName): PerfTrace => openTrace(name, false);

const openTrace = (name: PerfTraceName, sample: boolean): PerfTrace => {
    const startedAt = perfNow();
    return createPerfTrace({
        backend,
        id: createPerfTraceId(),
        name,
        elapsed: () => perfNow() - startedAt,
        announce: true,
        sample,
    });
};

export const adoptPerfTrace = (name: PerfTraceName, id: string, startedAtEpochMs: number): PerfTrace =>
    createPerfTrace({
        backend,
        id,
        name,
        elapsed: () => Date.now() - startedAtEpochMs,
        announce: false,
    });

export const recordPerfSample = (
    name: PerfTraceName,
    sample: { attributes?: Record<string, string>; metrics: Record<string, number> }
): void => {
    const trace = openTrace(name, true);
    for (const [key, value] of Object.entries(sample.attributes ?? {})) trace.putAttribute(key, value);
    for (const [key, value] of Object.entries(sample.metrics)) trace.putMetric(key, value);
    trace.stop();
};
