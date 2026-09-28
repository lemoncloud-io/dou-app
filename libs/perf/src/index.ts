/**
 * `@chatic/perf` — performance traces, and the backends they are recorded on.
 *
 * - `types.ts`    — the closed set of trace names, and what a backend receives
 * - `limits.ts`   — Firebase Performance's per-trace limits, enforced for every backend
 * - `PerfTrace.ts` — the trace handle and the backend port
 * - `runtime.ts`  — the process-wide slot instrumentation points call through
 * - `backends/`   — the log-pipeline fallback, and the buffer the WebView uses until it knows
 *                   which backend the installed app supports
 *
 * The Firebase-backed backend is not here. It needs the native SDK, which only the mobile app
 * has; the WebView reaches it over the bridge. See this package's README for how the pieces
 * are wired in each host.
 */

export * from './types';
export * from './limits';
export * from './sampling';
export * from './perfNow';
export * from './traceId';
export * from './PerfTrace';
export * from './runtime';
export * from './backends/LogPerfTraceBackend';
export * from './backends/DeferredPerfTraceBackend';
