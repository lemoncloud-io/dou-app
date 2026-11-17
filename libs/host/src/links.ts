import { hostProfile, type HostProfile } from '@chatic/bridges';

import { resolveAppOrPage, SHELL_DOMAINS_INTRODUCED_IN, type AppOrPage } from './appOrPage';

/**
 * Who takes the page's links out of it: opening a URL in the OS browser or a sub web view, the
 * clipboard, share intake, SMS and contact invites, and reading a link's preview. `app` — the app
 * does, through its bridge; `page` — the page does, with `window.open`, the Clipboard API and a
 * plain link.
 */
export interface LinksPort {
    readonly kind: AppOrPage;
}

export const resolveLinksMethod = (profile: HostProfile = hostProfile()): AppOrPage =>
    resolveAppOrPage(profile, 'links', SHELL_DOMAINS_INTRODUCED_IN);
