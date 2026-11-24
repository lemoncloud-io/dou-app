import { asDomStorage } from '@chatic/storage';

import { tabStore } from '../../../../../storage';
import { createHttpPort } from './createHttpPort';
import { portOneWindow } from '@chatic/web-checkout/windows';
import { relaySession, startSessionRuntime, subscriptionApi } from './runtime';
import { createStripeWindow } from '@chatic/web-checkout/windows';

import type { HttpSandbox, PaymentWindow } from './createHttpPort';
import type { HttpPort } from '@chatic/web-checkout';
import type { CardEntryChannel } from '@chatic/web-checkout';
import type { SubscriptionServer } from '../../../../../config/subscriptionServer';

export { SessionHost } from './SessionHost';

export const createLiveHttpPort = async (
    server: SubscriptionServer,
    cardEntry: CardEntryChannel,
    sandbox?: HttpSandbox & { paymentWindow: PaymentWindow }
): Promise<HttpPort> => {
    await startSessionRuntime(server.env);
    const stripeWindow = createStripeWindow(cardEntry);
    return createHttpPort({
        socialOauth: server.socialOauth,
        origin: window.location.origin,
        api: subscriptionApi(),
        session: relaySession,
        paymentWindow:
            sandbox?.paymentWindow ??
            (request => (request.issue.provider === 'stripe' ? stripeWindow(request) : portOneWindow(request))),
        storage: asDomStorage(tabStore),
        sandbox,
    });
};
