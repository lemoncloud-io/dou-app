import type { JSX } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { ROUTES } from '../../../routes/paths';

/**
 * `/auth/login` is a compatibility shim, not a screen.
 *
 * It is still the address the landing page and the native converter build, so already-distributed
 * deeplinks (`/auth/login?provider=invite&code=...&_backend=...`) arrive here. It forwards to root
 * carrying the original query string, where InviteEntryGate decides whether an invite goes on to the
 * accept page. Forwarding straight there instead would skip the gate — and with it the one place
 * that knows onboarding comes first on a first run.
 */
export const LoginPage = (): JSX.Element => {
    const { search } = useLocation();
    return <Navigate to={`${ROUTES.home}${search}`} replace />;
};
