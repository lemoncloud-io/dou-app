import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { toast } from 'sonner';

import { LoadingFallback } from '@lemon/shared';
import { useWebCoreStore } from '@lemon/web-core';

export const LogoutPage = () => {
    const { t } = useTranslation();
    const logout = useWebCoreStore(state => state.logout);
    const navigate = useNavigate();

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
