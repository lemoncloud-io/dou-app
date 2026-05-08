import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { toast } from 'sonner';

import { LoadingFallback } from '@chatic/shared';
import { useLogout } from '@chatic/auth';
import { useCacheMutations } from '../../../shared/hooks/useCacheMutations';

export const LogoutPage = () => {
    const { t } = useTranslation();

    const { mutate: logout } = useLogout();
    const logoutCalled = useRef(false);

    const { clearAllCache } = useCacheMutations();

    useEffect(() => {
        if (logoutCalled.current) return;
        logoutCalled.current = true;
        toast(t('oauth.logout'));
        void clearAllCache();
        logout();
    }, [logout, t]);

    return <LoadingFallback message={t('common.signout')} />;
};
