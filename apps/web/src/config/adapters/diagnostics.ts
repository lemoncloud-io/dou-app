import { diagnosticsAdapters } from '@chatic/runtime-web';
import type { ShellOrBrowserImplementations } from '@chatic/runtime-web';

import { appBridge } from '../../app/bridge/appBridge';

/**
 * Who carries the page's diagnostics in the web app: the shell or the page. Its shell is the phone app,
 * reached through `appBridge`; the page uses what any browser offers.
 *
 * The phone app keeps a debug switch of its own, merges the page's boot timeline into its boot record,
 * and queues the reports it detects while the page is gone. A browser tab has none of that: the page's
 * unlock record is its only switch, and its logs and reports go up from the page.
 */
export const webDiagnostics: ShellOrBrowserImplementations<'diagnostics'> = {
    shell: base => ({
        ...base,
        entry: 'icon',
        debugMode: {
            set: enabled => {
                appBridge.setDebugMode(enabled);
                // The app injects this global when it starts a page, so a restarted WebView boots already
                // unlocked. Written here too, so this page reads what it just told the app without a reload.
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

/** `diagnostics.host` follows what the host declared; `.shell` and `.browser` force a side the host allows. */
export const {
    host: diagnosticsHost,
    shell: diagnosticsShell,
    browser: diagnosticsBrowser,
} = diagnosticsAdapters(webDiagnostics);
