import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';

import { useNavigateWithTransition } from '@chatic/shared';

import { toast } from 'sonner';

import { LoadingFallback } from '@chatic/shared';
import { createCredentialsByProvider, loginWithInviteCode, useWebCoreStore } from '@chatic/web-core';

export const OAuthResponsePage = () => {
    const { t } = useTranslation();
    const setIsAuthenticated = useWebCoreStore(state => state.setIsAuthenticated);
    const location = useLocation();
    const navigate = useNavigateWithTransition();
    const checkLoginResultCalled = useRef(false);

    useEffect(() => {
        if (checkLoginResultCalled.current) {
            return;
        }
        checkLoginResultCalled.current = true;

        const checkLoginResult = async () => {
            const routeParams = new URLSearchParams(location.search);
            const code = routeParams.get('code') || '';
            const provider = routeParams.get('provider') || '';
            const stateParam = routeParams.get('state') || '';
            const isSuccess = code.length > 5;

            if (isSuccess) {
                // Handle invite provider separately
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
                    console.warn(t('oauth.error.stateParam'), e);
                }

                navigate(redirectTo, { replace: true });
                return;
            }

            toast(t('oauth.error.general'));
            navigate('/auth/login');
        };

        checkLoginResult();
    }, [location.search, t]);

    return <LoadingFallback message={t('oauth.signing')} />;
};
