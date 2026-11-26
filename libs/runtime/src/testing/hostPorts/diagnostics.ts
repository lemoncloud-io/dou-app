import type { DiagnosticsPort } from '../../api';

export const browserDiagnostics = (): DiagnosticsPort => ({
    kind: 'browser',
    entry: 'browser',
    debugMode: null,
    bootMetrics: null,
    pendingReports: null,
});
