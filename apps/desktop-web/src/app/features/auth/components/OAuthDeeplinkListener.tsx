import { useEffect } from 'react';

import { isNative, webClient } from '@chatic/bridges';

import { useSocialLogin } from '../hooks';
import { parseOAuthDeeplink } from '../utils';

/**
 * Receives the `chatic://oauth?code=...` deeplink the hand-off page fires from
 * the system browser. The shell forwards every deeplink as an
 * `OnReceiveNotification` event; the `chatic://oauth` scheme and host are ours — the
 * `chatic-open:` channel routing never sees it. Mounted on both router
 * branches. `start` registers the device first, so the usual case is a Guest Session being replaced:
 * complete() swaps the session and reloads. With no session at all (a link that lands after it was
 * lost), success flips isAuthenticated and the router swaps branches. A deeplink is exchanged only when this app started a login
 * (`completeFromHandoff`) — the scheme is open to anything on the machine.
 */
export const OAuthDeeplinkListener = () => {
    const { completeFromHandoff } = useSocialLogin();

    useEffect(() => {
        if (!isNative()) return;
        return webClient.onEvent('OnReceiveNotification', message => {
            const deeplink = (message?.data as { notification?: { data?: { deeplink?: string } } })?.notification?.data
                ?.deeplink;
            const payload = deeplink ? parseOAuthDeeplink(deeplink) : null;
            if (!payload) return;
            void completeFromHandoff(payload, { notifyFailure: true });
        });
    }, [completeFromHandoff]);

    return null;
};
