import { runtime } from '@chatic/runtime';

import { deviceStore } from '../../../../../storage';
import { type LandingSession, startLandingRuntime } from '../../../../../../config/landing';

import { exchangeSignInCode, readDeviceId } from './signInExchange';

import type { SessionAccess, SubscriptionApi } from './createHttpPort';

let session: LandingSession | undefined;

/**
 * Starts the shared session runtime the site declares (`src/config/landing.ts`), once per page. The
 * port awaits it as it is made, and `index.ts` makes the port before it renders the session host, so
 * the host never mounts on a runtime that has not started.
 */
export const startSessionRuntime = async (env: (name: string) => string | undefined): Promise<void> => {
    session = await startLandingRuntime(env);
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
                loginGuest: deviceId => {
                    if (!session) throw new Error('session runtime not booted');
                    return session.loginGuest(deviceId);
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
