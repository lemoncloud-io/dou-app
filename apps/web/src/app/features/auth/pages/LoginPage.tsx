import type { JSX } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { ROUTES } from '../../../routes/paths';

/**
 * Invite handling moved to the home route, so `/auth/login` is now a thin compatibility shim:
 * it forwards to root carrying the original query string, so already-distributed deeplinks
 * (`/auth/login?provider=invite&code=...&_backend=...`) keep working and land on the home
 * invite popup. Non-invite landings simply fall through to home as well.
 */
export const LoginPage = (): JSX.Element => {
    const location = useLocation();
    return <Navigate to={`${ROUTES.home}${location.search}`} replace />;
};
