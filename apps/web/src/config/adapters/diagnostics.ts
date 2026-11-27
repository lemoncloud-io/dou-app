import { webClient } from '@chatic/bridges';
import { browserDiagnostics } from '@chatic/host-web-browser';
import { mobileShellDiagnostics } from '@chatic/host-web-mobile-shell';
import { diagnosticsAdapters } from '@chatic/runtime-hybrid-web';
import type { ShellOrBrowserImplementations } from '@chatic/runtime-hybrid-web';

export const webDiagnostics: ShellOrBrowserImplementations<'diagnostics'> = {
    shell: mobileShellDiagnostics(webClient),
    browser: browserDiagnostics,
};

export const {
    host: diagnosticsHost,
    shell: diagnosticsShell,
    browser: diagnosticsBrowser,
} = diagnosticsAdapters(webDiagnostics);
