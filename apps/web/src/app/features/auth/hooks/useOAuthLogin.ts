import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';

import { toast } from 'sonner';

import { logger } from '@chatic/bridges';
import { useNavigateWithTransition } from '@chatic/shared';
import { createCredentialsByProvider, useRefreshRelaySession, useSessionIdentity } from '@chatic/web-core';

import { ROUTES } from '../../../routes/paths';

/**
 * Handles the OAuth provider redirect: reads `code`/`provider`/`state` from the URL, exchanges them
 * for transport credentials, then hydrates the relay session before navigating to `state.from`.
 *
 * Credential exchange (createCredentialsByProvider / loginWithInviteCode) only builds transport
 * credentials; `refreshRelaySession({ syncProfile: true })` hydrates identity + auth state.
 * Runs once on mount.
 */
export const useOAuthLogin = (): void => {
    const { t } = useTranslation();
    const location = useLocation();
    const navigate = useNavigateWithTransition();
    const { delegatorId } = useSessionIdentity();
    const { refreshRelaySession } = useRefreshRelaySession();
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
                if (!delegatorId) throw new Error('No delegatorId for invite login');
            } else {
                await createCredentialsByProvider(provider, code);
            }
            await refreshRelaySession({ syncProfile: true });

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
    }, [location.search, navigate, delegatorId, refreshRelaySession, t]);
};
