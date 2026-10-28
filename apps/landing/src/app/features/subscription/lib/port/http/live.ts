import { createHttpPort, type PaymentWindow } from './createHttpPort';
import { portOneWindow } from './portOneWindow';
import { bootSessionRuntime, relaySession, signedRequest } from './runtime';

import type { HttpPort } from './methods';
import type { SubscriptionServer } from '../../../../../config/subscriptionServer';

export { SessionHost } from './SessionHost';

/**
 * Everything the HTTP port needs from the browser and the shared runtime, put together. This module
 * is what `index.ts` loads on first use, so the session runtime and the payment SDK reach a page only
 * when the account surface runs against the server.
 */
export const createLiveHttpPort = (server: SubscriptionServer, standInWindow: PaymentWindow): HttpPort => {
    bootSessionRuntime(server.env);
    return createHttpPort({
        backend: server.backend,
        paymentsMock: server.paymentsMock,
        socialOauth: server.socialOauth,
        origin: window.location.origin,
        request: signedRequest,
        session: relaySession,
        // Sample payments have no provider window to open, so the stand-in answers in its place.
        paymentWindow: server.paymentsMock ? standInWindow : portOneWindow,
        storage: sessionStorage,
    });
};
