import { runtime } from '@chatic/app-runtime';
import { config, createWebEnvAdapter } from '@chatic/config';

import type { SessionAccess, SubscriptionApi } from './createHttpPort';

let booted = false;

/**
 * Starts the shared session runtime the way the admin console does, once per page: configuration from
 * the build's values, then the runtime itself. The port calls it as it is made, and `index.ts` makes the
 * port before it renders the session host, so the host never mounts on an unconfigured runtime.
 *
 * The runtime's default answer to a session the server confirms is over is an alert and a jump to a
 * logout page this site does not have. The port reports a refused call as `unauthenticated`, which
 * the route root already turns into the sign-in page with the way back, so that answer is switched off.
 */
export const bootSessionRuntime = (env: (name: string) => string | undefined): void => {
    if (booted) return;
    booted = true;
    config.init({ env: createWebEnvAdapter(env), storage: { local: localStorage, session: sessionStorage } });
    runtime.boot.initAppRuntime();
    runtime.session.authFailureReaction.register(() => undefined);
};

/**
 * The subscription server's calls: the runtime's subscription repository, signed with the relay
 * session like every other call the apps make. `useRuntimeRepositories` only reads the runtime's
 * repository graph — it holds no React state — so it is read here, outside a component.
 */
export const subscriptionApi = (): SubscriptionApi => runtime.data.useRuntimeRepositories().subscription;

export const relaySession: SessionAccess = {
    user: () => runtime.session.getRelaySessionUser(),
    exchange: async (provider, code) => {
        await runtime.session.createCredentialsByProvider(provider, code);
    },
    // Clears the session here and lands on the home page (`/?logout=1`); the server keeps no session
    // to end.
    signOut: () => runtime.session.logoutSession(),
};
