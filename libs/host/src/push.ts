import { hostProfile, type HostProfile } from '@chatic/bridges';

import { resolveAppOrPage, SHELL_DOMAINS_INTRODUCED_IN, type AppOrPage } from './appOrPage';

/**
 * Who receives notifications for this device: registering its token, muting it, and the taps and
 * deliveries that come back. `app` — the app does, through its bridge; `page` — nothing does: a
 * browser tab registers no device and receives no push.
 */
export interface PushPort {
    readonly kind: AppOrPage;
}

export const resolvePushMethod = (profile: HostProfile = hostProfile()): AppOrPage =>
    resolveAppOrPage(profile, 'push', SHELL_DOMAINS_INTRODUCED_IN);
