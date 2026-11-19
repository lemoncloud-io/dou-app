import { runtime } from '@chatic/runtime';
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import { useSocialLogin } from '../hooks';
import { parseOAuthDeeplink } from '../utils';

/**
 * Receives the `chatic://oauth?code=...` deeplink the hand-off page fires from
 * the system browser, through the relay sign-in's hand-off links (`runtime.signIn`), which carry every
 * deeplink the app is opened with; the `chatic://oauth` scheme and host are ours — the
 * `chatic-open:` channel routing never sees it. Mounted on both router
 * branches. `start` registers the device first, so the usual case is a Guest Session being replaced:
 * complete() swaps the session and reloads. With no session at all (a link that lands after it was
 * lost), success flips isAuthenticated and the router swaps branches. A deeplink is exchanged only when this app started a login
 * (`completeFromHandoff`) — the scheme is open to anything on the machine.
 */
export const OAuthDeeplinkListener = () => {
    const { completeFromHandoff } = useSocialLogin();
    // A ref: `navigate` changes with every route, and the native subscription should not churn with it.
    const navigate = useNavigate();
    const navigateRef = useRef(navigate);
    navigateRef.current = navigate;

    useEffect(() => {
        // Only the app receives the deeplink; a browser tab has no hand-off links.
        const handoffLinks = runtime.signIn.relayOAuth?.handoffLinks;
        if (!handoffLinks) return;
        return handoffLinks.subscribe(deeplink => {
            const payload = parseOAuthDeeplink(deeplink);
            if (!payload) return;
            // A link's outcome, refused ones included, is shown on the account hub's sign-in card.
            void completeFromHandoff(payload, { notifyFailure: true }).then(done => {
                if (done === 'link') navigateRef.current('/account');
            });
        });
    }, [completeFromHandoff]);

    return null;
};
