import { useEffect } from 'react';

import { isNative, webClient } from '@chatic/bridges';

import { useSocialLogin } from '../hooks';
import { parseOAuthDeeplink } from '../utils';

/**
 * Receives the `chatic://oauth?code=...` deeplink the hand-off page fires from
 * the system browser (ADR 0009). The shell forwards every deeplink as an
 * `OnReceiveNotification` event; the `chatic://oauth` prefix is ours — the
 * `chatic-open:` channel routing never sees it. Mounted on both router
 * branches: pre-auth, success flips isAuthenticated and the router swaps
 * branches; in-app (a Guest Session linking to Google from the Profile page),
 * complete() swaps the session and reloads.
 */
export const OAuthDeeplinkListener = () => {
    const { complete } = useSocialLogin();

    useEffect(() => {
        if (!isNative()) return;
        return webClient.onEvent('OnReceiveNotification', message => {
            const deeplink = (message?.data as { notification?: { data?: { deeplink?: string } } })?.notification?.data
                ?.deeplink;
            const payload = deeplink ? parseOAuthDeeplink(deeplink) : null;
            if (!payload) return;
            void complete(payload.provider, payload.code);
        });
    }, [complete]);

    return null;
};
