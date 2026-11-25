import { useCallback } from 'react';

import { logger } from '@chatic/bridges';
import { runtime } from '@chatic/runtime-react';

import { useAccountResetOnLogout } from '../../../shared';

export const useSignOutGuest = () => {
    const logout = runtime.session.useSessionLogout();
    const { resetAccount } = useAccountResetOnLogout();
    return useCallback(async () => {
        try {
            await resetAccount();
        } catch (error) {
            logger.warn('AUTH', '[useSignOutGuest] account reset failed', { error });
        }
        await logout();
    }, [logout, resetAccount]);
};
