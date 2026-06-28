import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { toast } from 'sonner';

import { LoadingFallback } from '@chatic/shared';
import { useSessionLogout } from '@chatic/web-core';

import { useClearCache } from '../hooks';

export const LogoutPage = () => {
    const { t } = useTranslation();

    const logout = useSessionLogout();
    const { clearAllCache } = useClearCache();
    const logoutCalled = useRef(false);

    useEffect(() => {
        if (logoutCalled.current) return;
        logoutCalled.current = true;
        toast(t('oauth.logout'));
        // Clear all local caches, then tear down the relay session. The runtime auto-performs a
        // guest login afterwards, so the next session starts from a clean cache.
        void clearAllCache().finally(() => logout());
    }, [logout, clearAllCache, t]);

    return <LoadingFallback message={t('common.signout')} />;
};
