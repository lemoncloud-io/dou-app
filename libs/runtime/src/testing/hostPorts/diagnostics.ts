import type { DiagnosticsPort } from '@chatic/runtime-client';

export const browserDiagnostics = (): DiagnosticsPort => ({
    kind: 'browser',
    entry: 'browser',
    debugMode: null,
    bootMetrics: null,
    pendingReports: null,
});
