import { createHttpPort } from './createHttpPort';
import { portOneWindow } from './portOneWindow';
import { bootSessionRuntime, relaySession, subscriptionApi } from './runtime';
import { createStripeWindow } from './stripeWindow';

import type { HttpPort } from './methods';
import type { CardEntryChannel } from '../cardEntry';
import type { SubscriptionServer } from '../../../../../config/subscriptionServer';

export { SessionHost } from './SessionHost';

/**
 * Everything the HTTP port needs from the browser and the shared runtime, put together. This module
 * is what `index.ts` loads on first use, so the session runtime and the payment SDKs reach a page only
 * when the account surface runs against the server. The card entry is the provider's that the server's
 * `issue` answer names: the won provider's own window, or the dollar provider's card field in the dialog
 * `cardEntry` reaches.
 */
export const createLiveHttpPort = (server: SubscriptionServer, cardEntry: CardEntryChannel): HttpPort => {
    bootSessionRuntime(server.env);
    const stripeWindow = createStripeWindow(cardEntry);
    return createHttpPort({
        socialOauth: server.socialOauth,
        origin: window.location.origin,
        api: subscriptionApi(),
        session: relaySession,
        paymentWindow: request =>
            request.issue.provider === 'stripe' ? stripeWindow(request) : portOneWindow(request),
        storage: sessionStorage,
    });
};
