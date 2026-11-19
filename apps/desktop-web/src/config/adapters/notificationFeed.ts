import { webClient } from '@chatic/bridges';
import type { OnNotificationPayload } from '@chatic/bridge-messages';

/**
 * Calls `listener` with the payload of each `OnReceiveNotification` message the desktop app sends; one
 * that arrives without a payload is not passed on. Returns the unsubscribe.
 *
 * The app sends everything it hands the page about notifications on that one message: a banner click,
 * a menu bar `chatic-ui:` link, and every deeplink the app is opened with — an OAuth hand-off included.
 * So the push port's notification feed and the sign-in port's hand-off links both read it, and both read
 * it through here: a change to how the message is read reaches both members at once.
 */
export const onDesktopNotification = (listener: (payload: OnNotificationPayload) => void): (() => void) =>
    webClient.onEvent('OnReceiveNotification', message => {
        // Typed as always present, but a bridge event is whatever the other side sent; an empty one is
        // dropped rather than thrown on inside the bridge's dispatch.
        const payload = (message as typeof message | undefined)?.data;
        if (!payload) return;
        listener(payload);
    });
