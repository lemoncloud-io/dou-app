import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { toast } from 'sonner';

import { LoadingFallback } from '@chatic/shared';
import { useLogout } from '@chatic/auth';
import { useCacheMutations } from '@chatic/data';
import { cloudCore, useWebCoreStore } from '@chatic/web-core';

export const LogoutPage = () => {
    const { t } = useTranslation();
    const { profile } = useWebCoreStore();
    const selectedCloudId = cloudCore.getSelectedCloudId() ?? 'default';

    const { mutate: logout } = useLogout();
    const logoutCalled = useRef(false);

    const { clearAllCache } = useCacheMutations(selectedCloudId, profile?.uid);

    useEffect(() => {
        if (logoutCalled.current) return;
        logoutCalled.current = true;
        toast(t('oauth.logout'));
        void clearAllCache();
        logout();
    }, [logout, t]);

    return <LoadingFallback message={t('common.signout')} />;
};
