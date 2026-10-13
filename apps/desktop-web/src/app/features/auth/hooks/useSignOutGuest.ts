import { useCallback } from 'react';

import { logger } from '@chatic/bridges';
import { runtime } from '@chatic/app-runtime';

import { useAccountResetOnLogout } from '../../../shared';

/**
 * Signs out a guest that a sign-in registered on its way and the person then backed out of. It holds
 * nothing yet, so this is the rail's logout without its confirmation. Resolves either way: a failed
 * reset must not keep someone on a screen they asked to leave.
 */
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
