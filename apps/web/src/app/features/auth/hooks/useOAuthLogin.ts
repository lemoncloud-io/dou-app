import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';

import { toast } from 'sonner';

import { logger } from '@chatic/bridges';
import { useNavigateWithTransition } from '@chatic/shared';
import { createCredentialsByProvider, useSessionIdentity } from '@chatic/app-runtime';

import { ROUTES } from '../../../routes/paths';

/**
 * Handles the OAuth provider redirect: reads `code`/`provider`/`state` from the URL, exchanges them
 * for a relay session, then navigates to `state.from`. Runs once on mount.
 *
 * The exchange commits the session by itself now. It used to build transport credentials only, so
 * this hook followed it with `refreshRelaySession({ syncProfile: true })` to recover the identity
 * fields the exchange had discarded — a refresh call made for its RESPONSE, not to renew anything
 * (ADR-0070 불변조건 1·2).
 */
export const useOAuthLogin = (): void => {
    const { t } = useTranslation();
    const location = useLocation();
    const navigate = useNavigateWithTransition();
    const { delegatorId } = useSessionIdentity();
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
                logger.error('AUTH', '[useOAuthLogin] oauth callback carried no code', {
                    data: { provider },
                });
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
            logger.info('AUTH', '[useOAuthLogin] oauth login succeeded', { provider });

            let redirectTo = '/home';
            try {
                const stateObj = JSON.parse(decodeURIComponent(stateParam));
                redirectTo = stateObj.from || '/home';
            } catch (e) {
                logger.warn('AUTH', t('oauth.error.stateParam'), e);
            }

            navigate(redirectTo, { replace: true });
        };

        // Without this catch the invite-branch throw above escapes as an unhandled rejection, so the
        // login failure reaches the global handler with no AUTH breadcrumb of its own.
        void run().catch(error => logger.error('AUTH', '[useOAuthLogin] oauth login failed', { error }));
    }, [location.search, navigate, delegatorId, t]);
};
