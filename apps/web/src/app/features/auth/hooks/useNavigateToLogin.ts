import { useCallback } from 'react';
import { useLocation } from 'react-router-dom';

import { logger } from '@chatic/bridges';
import { useNavigateWithTransition } from '@chatic/shared';

import { ROUTES } from '../../../routes/paths';

export interface LoginLocationState {
    returnTo?: string;
}

export const useNavigateToLogin = () => {
    const navigate = useNavigateWithTransition();
    const { pathname, search, hash } = useLocation();

    return useCallback(() => {
        const isOnLogin = pathname === ROUTES.mypage.login;
        const returnTo = isOnLogin ? undefined : `${pathname}${search}${hash}`;
        void Promise.resolve(navigate(ROUTES.mypage.login, { state: { returnTo } satisfies LoginLocationState })).catch(
            error => logger.error('AUTH', '[useNavigateToLogin] Navigation failed', { error })
        );
    }, [navigate, pathname, search, hash]);
};
