import type { SignInPort } from '@chatic/runtime-client';

export const browserSignIn = (): SignInPort => ({
    kind: 'browser',
    os: null,
    sessionScope: 'tab',
    approvesPairing: false,
    requestsPairing: true,
    providerSignIn: null,
    relayOAuth: null,
});
