import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';

import { toast } from 'sonner';

import { logger } from '@chatic/bridges';
import { useNavigateWithTransition } from '@chatic/shared';
import { createCredentialsByProvider, loginWithInviteCode, useWebCoreStore } from '@chatic/web-core';

import { ROUTES } from '../../../routes/paths';

/**
 * Handles the OAuth provider redirect: reads `code`/`provider`/`state` from the URL, exchanges them
 * for credentials, marks the session authenticated, then navigates to the `state.from` target.
 * Runs once on mount.
 */
export const useOAuthLogin = (): void => {
    const { t } = useTranslation();
    const location = useLocation();
    const navigate = useNavigateWithTransition();
    const setIsAuthenticated = useWebCoreStore(state => state.setIsAuthenticated);
    const handled = useRef(false);

    useEffect(() => {
        if (handled.current) return;
        handled.current = true;

        const run = async () => {
            const routeParams = new URLSearchParams(location.search);
            const code = routeParams.get('code') || '';
            const provider = routeParams.get('provider') || '';
            const stateParam = routeParams.get('state') || '';
            const isSuccess = code.length > 5;

            if (!isSuccess) {
                toast(t('oauth.error.general'));
                navigate(ROUTES.auth.login, { replace: true });
                return;
            }

            // Invite provider logs in by code; other providers exchange the code for credentials.
            if (provider === 'invite') {
                await loginWithInviteCode(code);
            } else {
                await createCredentialsByProvider(provider, code);
            }
            setIsAuthenticated(true);

            let redirectTo = '/home';
            try {
                const stateObj = JSON.parse(decodeURIComponent(stateParam));
                redirectTo = stateObj.from || '/home';
            } catch (e) {
                logger.warn('AUTH', t('oauth.error.stateParam'), e);
            }

            navigate(redirectTo, { replace: true });
        };

        run();
    }, [location.search, navigate, setIsAuthenticated, t]);
};
