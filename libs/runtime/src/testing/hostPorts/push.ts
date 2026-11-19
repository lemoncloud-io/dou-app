import type { PushPort } from '@chatic/runtime-client';

/**
 * A browser tab's `push` port for tests: what the page does on its own, with no runner's mock in it —
 * this file loads under jest and vitest alike. A tab registers no device, receives no push and raises
 * no banner, so every member is empty. A test that needs to watch a member lays its own over it.
 */
export const browserPush = (): PushPort => ({
    kind: 'browser',
    notifications: null,
    deviceToken: null,
    tokenRenewal: null,
    localBanner: null,
});
