import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { toast } from 'sonner';

import { LoadingFallback } from '@chatic/shared';
import { useSessionLogout } from '@chatic/web-core';

export const LogoutPage = () => {
    const { t } = useTranslation();

    const logout = useSessionLogout();
    const logoutCalled = useRef(false);

    useEffect(() => {
        if (logoutCalled.current) return;
        logoutCalled.current = true;
        toast(t('oauth.logout'));
        void logout();
    }, [logout, t]);

    return <LoadingFallback message={t('common.signout')} />;
};
