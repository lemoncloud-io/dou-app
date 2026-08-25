import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { toast } from 'sonner';

import { logger } from '@chatic/bridges';
import { LoadingFallback } from '@chatic/shared';

import { useSessionLogout } from '../../../runtime/useSessionLogout';

export const LogoutPage = () => {
    const { t } = useTranslation();

    const logout = useSessionLogout();
    const logoutCalled = useRef(false);

    useEffect(() => {
        if (logoutCalled.current) return;
        logoutCalled.current = true;
        toast(t('oauth.logout'));
        logger.info('AUTH', '[LogoutPage] logout requested');
        // A rejected teardown used to be invisible: the screen keeps rendering LoadingFallback, so the
        // user is stranded on a spinner with nothing written down anywhere.
        void logout().catch(error => logger.error('AUTH', '[LogoutPage] logout failed', { error }));
    }, [logout, t]);

    return <LoadingFallback message={t('common.signout')} />;
};
