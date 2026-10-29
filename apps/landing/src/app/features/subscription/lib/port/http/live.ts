import { createHttpPort } from './createHttpPort';
import { portOneWindow } from './portOneWindow';
import { bootSessionRuntime, relaySession, subscriptionApi } from './runtime';

import type { HttpPort } from './methods';
import type { SubscriptionServer } from '../../../../../config/subscriptionServer';

export { SessionHost } from './SessionHost';

/**
 * Everything the HTTP port needs from the browser and the shared runtime, put together. This module
 * is what `index.ts` loads on first use, so the session runtime and the payment SDK reach a page only
 * when the account surface runs against the server.
 */
export const createLiveHttpPort = (server: SubscriptionServer): HttpPort => {
    bootSessionRuntime(server.env);
    return createHttpPort({
        socialOauth: server.socialOauth,
        origin: window.location.origin,
        api: subscriptionApi(),
        session: relaySession,
        paymentWindow: portOneWindow,
        storage: sessionStorage,
    });
};
