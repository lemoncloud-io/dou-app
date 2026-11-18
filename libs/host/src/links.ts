import { hostProfile, type HostProfile } from '@chatic/bridges';

import { resolveShellOrBrowser, SHELL_DOMAINS_INTRODUCED_IN, type ShellOrBrowser } from './shellOrBrowser';

/**
 * Who takes the page's links out of it: opening a URL in the OS browser or a sub web view, the
 * clipboard, share intake, SMS and contact invites, and reading a link's preview. `shell` — the app
 * does, through its bridge; `browser` — the page does, with `window.open`, the Clipboard API and a
 * plain link.
 */
export interface LinksPort {
    readonly kind: ShellOrBrowser;
}

export const resolveLinksMethod = (profile: HostProfile = hostProfile()): ShellOrBrowser =>
    resolveShellOrBrowser(profile, 'links', SHELL_DOMAINS_INTRODUCED_IN);
