import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { useNavigateWithTransition } from '@chatic/page-transition';

import { toast } from 'sonner';

import { LoadingFallback } from '@chatic/shared';
import { useWebCoreStore } from '@chatic/web-core';

export const LogoutPage = () => {
    const { t } = useTranslation();
    const logout = useWebCoreStore(state => state.logout);
    const navigate = useNavigateWithTransition();

    useEffect(() => {
        const handleLogout = async () => {
            toast(t('oauth.logout'));
            await logout();
            navigate('/', { replace: true });
        };

        handleLogout();
    }, [logout, navigate, t]);

    return <LoadingFallback message={t('common.signout')} />;
};
