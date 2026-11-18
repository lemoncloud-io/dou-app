import { hostProfile, type HostProfile } from '@chatic/bridges';

import { resolveShellOrBrowser, SHELL_DOMAINS_INTRODUCED_IN, type ShellOrBrowser } from './shellOrBrowser';

/**
 * Where the page's diagnostics go: its logs and their upload, the telemetry entry point, issue
 * reports and boot metrics. `shell` — through the app, which queues logs and reports and was the
 * entry point (its icon); `browser` — the page sends its own, and was opened in a browser.
 */
export interface DiagnosticsPort {
    readonly kind: ShellOrBrowser;
}

export const resolveDiagnosticsMethod = (profile: HostProfile = hostProfile()): ShellOrBrowser =>
    resolveShellOrBrowser(profile, 'diagnostics', SHELL_DOMAINS_INTRODUCED_IN);
