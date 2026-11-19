import type { SignInPort } from '@chatic/runtime-client';

/**
 * A browser tab's `signIn` port for tests: what the page does on its own, with no runner's mock in it —
 * this file loads under jest and vitest alike. A tab's sign-in ends with the tab; it asks to pair and
 * never approves; it has none of an app's provider sign-in, and no relay sign-in either — the one app
 * that runs it in a tab lays its own. A test that needs to watch a member lays its own over this one.
 */
export const browserSignIn = (): SignInPort => ({
    kind: 'browser',
    os: null,
    sessionScope: 'tab',
    approvesPairing: false,
    requestsPairing: true,
    providerSignIn: null,
    relayOAuth: null,
});
