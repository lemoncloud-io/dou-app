import { Navigate } from 'react-router-dom';

import { ROUTES } from './paths';

/**
 * Root entry for the unauthenticated router.
 *
 * The app performs a background guest login (keepAlive) that creates a session profile and flips
 * `isAuthenticated`; the router then rebuilds with the private routes. So we simply hold on `/`
 * (rendering nothing) and wait — the original query string is preserved, so an invite deeplink
 * (`/?provider=invite&...`) stays available for the home invite popup to pick up post-auth.
 *
 * We must NOT redirect to `/auth/login` here: `LoginPage` is now a shim that forwards back to `/`,
 * so any such redirect produces an infinite `/` ⇄ `/auth/login` loop.
 */
const PublicRootEntry = (): null => null;

export const publicRoutes = [
    { path: ROUTES.root, element: <PublicRootEntry /> },
    // Unknown unauthenticated paths fall back to root and hold there. Redirecting to
    // `/auth/login` would loop via the LoginPage shim (see above).
    { path: '*', element: <Navigate to={ROUTES.root} replace /> },
];
