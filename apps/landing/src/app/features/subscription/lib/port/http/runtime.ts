import { runtime } from '@chatic/runtime';

import { deviceStore } from '../../../../../storage';
import { type LandingSession, startLandingRuntime } from '../../../../../../config/landing';

import { exchangeSignInCode, readDeviceId } from './signInExchange';

import type { SessionAccess, SubscriptionApi } from './createHttpPort';

let session: LandingSession | undefined;

export const startSessionRuntime = async (env: (name: string) => string | undefined): Promise<void> => {
    session = await startLandingRuntime(env);
};

export const subscriptionApi = (): SubscriptionApi => runtime.data.useRuntimeRepositories().subscription;

export const relaySession: SessionAccess = {
    user: () => runtime.session.getRelaySessionUser(),
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
    signOut: () => runtime.session.logoutSession(),
};
