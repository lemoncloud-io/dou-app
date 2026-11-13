import { runtime } from '@chatic/app-runtime';
import { createWebRuntime } from '@chatic/runtime-web';
import { config, createWebEnvAdapter } from '@chatic/config';
import { asDomStorage } from '@chatic/storage';

import { deviceStore, localStore, tabStore } from '../../../../../storage';

import { exchangeSignInCode, readDeviceId } from './signInExchange';

import type { SessionAccess, SubscriptionApi } from './createHttpPort';

let booted = false;
let engine: ReturnType<typeof createWebRuntime> | undefined;

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
    config.init({
        env: createWebEnvAdapter(env),
        storage: { local: asDomStorage(localStore), session: asDomStorage(tabStore) },
    });
    // This site runs in a browser tab and nowhere else, so the session lives in this tab's storage, as
    // every other per-tab state here does.
    engine = createWebRuntime({
        storage: { secret: tabStore, plain: tabStore, device: deviceStore },
        cacheTab: tabStore,
    });
    runtime.boot.initAppRuntime(engine);
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
    // Signed with this browser's device guest, as the desktop app does — see `exchangeSignInCode`.
    exchange: (provider, code) =>
        exchangeSignInCode(
            {
                isAuthenticated: () => runtime.session.getIdentityContext().isAuthenticated,
                loginGuest: deviceId => {
                    if (!engine) throw new Error('session runtime not booted');
                    return engine.commands.loginGuestByDevice(deviceId);
                },
                exchangeLinked: (provider, code) =>
                    runtime.session.createCredentialsByProvider(provider, code, { linkCurrentSession: true }),
            },
            () => readDeviceId(deviceStore),
            provider,
            code
        ),
    // Clears the session here and lands on the home page (`/?logout=1`); the server keeps no session
    // to end.
    signOut: () => runtime.session.logoutSession(),
};
