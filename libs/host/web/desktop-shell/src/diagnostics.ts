import type { DiagnosticsPort } from '@chatic/ports';

export const desktopShellDiagnostics = (base: Pick<DiagnosticsPort, 'kind'>): DiagnosticsPort => ({
    ...base,
    entry: 'icon',
    debugMode: null,
    bootMetrics: null,
    pendingReports: null,
});
