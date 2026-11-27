import { diagnosticsAdapters } from '@chatic/runtime-hybrid-web';
import type { ShellOrBrowserImplementations } from '@chatic/runtime-hybrid-web';

import { appBridge } from '../../app/bridge/appBridge';

export const webDiagnostics: ShellOrBrowserImplementations<'diagnostics'> = {
    shell: base => ({
        ...base,
        entry: 'icon',
        debugMode: {
            set: enabled => {
                appBridge.setDebugMode(enabled);
                (window as unknown as { CHATIC_APP_DEBUG_MODE?: boolean }).CHATIC_APP_DEBUG_MODE = enabled;
            },
        },
        bootMetrics: { send: snapshot => appBridge.sendBootMetrics(snapshot) },
        pendingReports: {
            fetch: async () => {
                const response = await appBridge.fetchPendingReports();
                return response.success ? (response.data?.reports ?? []) : [];
            },
            ack: async ids => {
                await appBridge.ackPendingReports(ids);
            },
        },
    }),
    browser: base => ({ ...base, entry: 'browser', debugMode: null, bootMetrics: null, pendingReports: null }),
};

export const {
    host: diagnosticsHost,
    shell: diagnosticsShell,
    browser: diagnosticsBrowser,
} = diagnosticsAdapters(webDiagnostics);
