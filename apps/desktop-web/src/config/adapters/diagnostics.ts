import { diagnosticsAdapters } from '@chatic/runtime-web';
import type { ShellOrBrowserImplementations } from '@chatic/runtime-web';

/**
 * Who carries the page's diagnostics in desktop-web: the shell or the page. Its shell is the desktop app,
 * reached through `webClient` requests; the page uses what any browser offers.
 *
 * The desktop app keeps no debug switch, boot record or report queue the page talks to, so both sides
 * leave those members empty and differ only in how the run was entered.
 */
export const desktopDiagnostics: ShellOrBrowserImplementations<'diagnostics'> = {
    shell: base => ({ ...base, entry: 'icon', debugMode: null, bootMetrics: null, pendingReports: null }),
    browser: base => ({ ...base, entry: 'browser', debugMode: null, bootMetrics: null, pendingReports: null }),
};

/** `diagnostics.host` follows what the host declared; `.shell` and `.browser` force a side the host allows. */
export const {
    host: diagnosticsHost,
    shell: diagnosticsShell,
    browser: diagnosticsBrowser,
} = diagnosticsAdapters(desktopDiagnostics);
