import { browserDiagnostics } from '@chatic/host-web-browser';
import { desktopShellDiagnostics } from '@chatic/host-web-desktop-shell';
import { diagnosticsAdapters } from '@chatic/runtime-hybrid-web';
import type { ShellOrBrowserImplementations } from '@chatic/runtime-hybrid-web';

export const desktopDiagnostics: ShellOrBrowserImplementations<'diagnostics'> = {
    shell: desktopShellDiagnostics,
    browser: browserDiagnostics,
};

export const {
    host: diagnosticsHost,
    shell: diagnosticsShell,
    browser: diagnosticsBrowser,
} = diagnosticsAdapters(desktopDiagnostics);
