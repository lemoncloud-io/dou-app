import type { DiagnosticsPort } from '@chatic/runtime-client';

/**
 * A browser tab's `diagnostics` port for tests: what the page does on its own, with no runner's mock in it —
 * this file loads under jest and vitest alike. A test that needs to watch a member passes its own.
 */
export const browserDiagnostics = (): DiagnosticsPort => ({
    kind: 'browser',
    entry: 'browser',
    debugMode: null,
    bootMetrics: null,
    pendingReports: null,
});
