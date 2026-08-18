import { useCallback } from 'react';
import { useLocation } from 'react-router-dom';

import { logger } from '@chatic/bridges';
import { useNavigateWithTransition } from '@chatic/shared';

import { ROUTES } from '../../../routes/paths';

/** Router state carried into the login screen: where to go once the user is signed in. */
export interface LoginLocationState {
    returnTo?: string;
}

/**
 * Go to the login screen, remembering the current one as the place to come back to.
 *
 * Five screens send users here and each expects a different destination — most importantly the
 * subscription flow, where landing on home instead of the plan page abandons a purchase midway
 * (ADR-0055). Capturing the origin lives HERE rather than at the call sites because the fallback is
 * home: a call site that forgets to pass it still "works", so the mistake is invisible until
 * someone notices their flow was cut short.
 *
 * `search` rides along too — a screen that keeps state in the query string only half-returns
 * without it.
 */
export const useNavigateToLogin = () => {
    const navigate = useNavigateWithTransition();
    const { pathname, search, hash } = useLocation();

    return useCallback(() => {
        // Never point back at login itself. No entry point renders there today, but the day one
        // does, signing in would return the user to the screen they just left.
        const isOnLogin = pathname === ROUTES.mypage.login;
        const returnTo = isOnLogin ? undefined : `${pathname}${search}${hash}`;
        void Promise.resolve(navigate(ROUTES.mypage.login, { state: { returnTo } satisfies LoginLocationState })).catch(
            error => logger.error('AUTH', '[useNavigateToLogin] Navigation failed', { error })
        );
    }, [navigate, pathname, search, hash]);
};
