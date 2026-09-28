import { NOOP_PERF_TRACE_BACKEND, createPerfTrace } from './PerfTrace';
import { perfNow } from './perfNow';
import { createPerfTraceId } from './traceId';

import type { PerfTrace, PerfTraceBackend } from './PerfTrace';
import type { PerfTraceName } from './types';

/**
 * The process-wide backend slot, and the free functions instrumentation points call.
 *
 * Instrumentation sits in unrelated code — a switch mutation, a room page, a web-vitals
 * callback — and cannot be handed a backend without threading it through every layer above,
 * so this slot is what they talk to. It starts at the no-op backend, which is what keeps a host
 * that never calls `configurePerfTraces` (desktop, testbed, a plain browser tab) silent by
 * construction rather than by a flag someone has to remember.
 *
 * A trace keeps the backend it was started on. Swapping the slot mid-flight — the WebView does,
 * once it learns what the installed app supports — leaves open traces where they began, so a
 * start is never paired with a stop on a different backend.
 */

let backend: PerfTraceBackend = NOOP_PERF_TRACE_BACKEND;

/** Points every trace started from now on at `next`. */
export const configurePerfTraces = (next: PerfTraceBackend): void => {
    backend = next;
};

/** Test seam, and the way a host turns tracing back off. */
export const resetPerfTraces = (): void => {
    backend = NOOP_PERF_TRACE_BACKEND;
};

/** Starts a trace now, on the monotonic clock. */
export const startPerfTrace = (name: PerfTraceName): PerfTrace => {
    const startedAt = perfNow();
    return createPerfTrace({
        backend,
        id: createPerfTraceId(),
        name,
        elapsed: () => perfNow() - startedAt,
        announce: true,
    });
};

/**
 * Takes over a trace another runtime started — the native shell opens `chat_room_open` at the
 * notification tap, and the WebView is the one that sees the room draw.
 *
 * `startedAtEpochMs` is wall-clock because it crossed a process boundary, and the two runtimes'
 * monotonic clocks share no origin. Marks recorded here are therefore relative to the original
 * start, not to the hand-over, which is what makes the native half of the wait visible.
 */
export const adoptPerfTrace = (name: PerfTraceName, id: string, startedAtEpochMs: number): PerfTrace =>
    createPerfTrace({
        backend,
        id,
        name,
        elapsed: () => Date.now() - startedAtEpochMs,
        announce: false,
    });

/**
 * Records a value measured by something else as a zero-length trace.
 *
 * For numbers that arrive finished — a web vital is reported by the browser, after the fact —
 * and so cannot be timed by a start and a stop. The value lives in `metrics`; the trace's own
 * duration is meaningless and is not what the console should be read for.
 */
export const recordPerfSample = (
    name: PerfTraceName,
    sample: { attributes?: Record<string, string>; metrics: Record<string, number> }
): void => {
    const trace = startPerfTrace(name);
    for (const [key, value] of Object.entries(sample.attributes ?? {})) trace.putAttribute(key, value);
    for (const [key, value] of Object.entries(sample.metrics)) trace.putMetric(key, value);
    trace.stop();
};
