import { diagnosticsAdapters } from '@chatic/runtime-web';
import type { ShellOrBrowserImplementations } from '@chatic/runtime-web';

export const desktopDiagnostics: ShellOrBrowserImplementations<'diagnostics'> = {
    shell: base => ({ ...base, entry: 'icon', debugMode: null, bootMetrics: null, pendingReports: null }),
    browser: base => ({ ...base, entry: 'browser', debugMode: null, bootMetrics: null, pendingReports: null }),
};

export const {
    host: diagnosticsHost,
    shell: diagnosticsShell,
    browser: diagnosticsBrowser,
} = diagnosticsAdapters(desktopDiagnostics);
