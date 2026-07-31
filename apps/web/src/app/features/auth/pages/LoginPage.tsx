import type { JSX } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { resolveInviteAcceptRedirect } from '../../invite/accept/lib/inviteEntryRedirect';
import { ROUTES } from '../../../routes/paths';

/**
 * `/auth/login` is a compatibility shim, not a screen.
 *
 * It is still the address the landing page and the native converter build, so already-distributed
 * deeplinks (`/auth/login?provider=invite&code=...&_backend=...`) arrive here and are forwarded on
 * with their query string intact — to the accept page when they carry an invite, to home when they
 * do not.
 */
export const LoginPage = (): JSX.Element => {
    const { search } = useLocation();
    return <Navigate to={resolveInviteAcceptRedirect(search) ?? `${ROUTES.home}${search}`} replace />;
};
