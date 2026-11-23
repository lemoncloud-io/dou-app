import type { PerfTrace } from './PerfTrace';
import type { PerfTraceName } from './types';

const active = new Map<PerfTraceName, { subject: string; trace: PerfTrace }>();

export const setActivePerfTrace = (name: PerfTraceName, subject: string, trace: PerfTrace): void => {
    active.set(name, { subject, trace });
};

export const getActivePerfTrace = (name: PerfTraceName, subject: string): PerfTrace | undefined => {
    const entry = active.get(name);
    return entry && entry.subject === subject ? entry.trace : undefined;
};

export const clearActivePerfTrace = (name: PerfTraceName, trace?: PerfTrace): void => {
    const entry = active.get(name);
    if (!entry) return;
    if (trace && entry.trace !== trace) return;
    active.delete(name);
};

export const endPerfTrace = (name: PerfTraceName, trace: PerfTrace, outcome: string): void => {
    clearActivePerfTrace(name, trace);
    trace.putAttribute('outcome', outcome);
    trace.stop();
};
