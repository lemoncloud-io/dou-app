import { hostProfile, type HostProfile } from '@chatic/bridges';

import { resolveShellOrBrowser, SHELL_DOMAINS_INTRODUCED_IN, type ShellOrBrowser } from './shellOrBrowser';

/**
 * Who receives notifications for this device: registering its token, muting it, and the taps and
 * deliveries that come back. `shell` — the app does, through its bridge; `browser` — nothing does: a
 * browser tab registers no device and receives no push.
 */
export interface PushPort {
    readonly kind: ShellOrBrowser;
}

export const resolvePushMethod = (profile: HostProfile = hostProfile()): ShellOrBrowser =>
    resolveShellOrBrowser(profile, 'push', SHELL_DOMAINS_INTRODUCED_IN);
