import { hostProfile, type HostProfile } from '@chatic/bridges';

import { resolveAppOrPage, SHELL_DOMAINS_INTRODUCED_IN, type AppOrPage } from './appOrPage';

/**
 * Where the page's diagnostics go: its logs and their upload, the telemetry entry point, issue
 * reports and boot metrics. `app` — through the app, which queues logs and reports and was the
 * entry point (its icon); `page` — the page sends its own, and was opened in a browser.
 */
export interface DiagnosticsPort {
    readonly kind: AppOrPage;
}

export const resolveDiagnosticsMethod = (profile: HostProfile = hostProfile()): AppOrPage =>
    resolveAppOrPage(profile, 'diagnostics', SHELL_DOMAINS_INTRODUCED_IN);
