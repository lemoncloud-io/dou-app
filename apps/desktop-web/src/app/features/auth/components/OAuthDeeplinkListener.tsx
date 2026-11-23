import { runtime } from '@chatic/runtime';
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import { useSocialLogin } from '../hooks';
import { parseOAuthDeeplink } from '../utils';

export const OAuthDeeplinkListener = () => {
    const { completeFromHandoff } = useSocialLogin();
    const navigate = useNavigate();
    const navigateRef = useRef(navigate);
    navigateRef.current = navigate;

    useEffect(() => {
        const handoffLinks = runtime.signIn.relayOAuth?.handoffLinks;
        if (!handoffLinks) return;
        return handoffLinks.subscribe(deeplink => {
            const payload = parseOAuthDeeplink(deeplink);
            if (!payload) return;
            void completeFromHandoff(payload, { notifyFailure: true }).then(done => {
                if (done === 'link') navigateRef.current('/account');
            });
        });
    }, [completeFromHandoff]);

    return null;
};
