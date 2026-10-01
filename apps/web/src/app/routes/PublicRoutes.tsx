import type { JSX } from 'react';
import { Navigate } from 'react-router-dom';

import { useBootSplashHold } from '../runtime/bootSplash';
import { InviteEntryGate } from './InviteEntryGate';
import { ROUTES } from './paths';

/**
 * Root entry for the unauthenticated router.
 *
 * The app performs a background guest login (keepAlive) that creates a session profile and flips
 * `isAuthenticated`; the router then rebuilds with the private routes. So we simply hold on `/`
 * (rendering nothing) and wait — the original query string is preserved.
 *
 * We must NOT redirect to `/auth/login` here: `LoginPage` is now a shim that forwards back to `/`,
 * so any such redirect produces an infinite `/` ⇄ `/auth/login` loop.
 *
 * The gate is the one thing that does leave: an invite landing goes to `/invite/accept`, which is a
 * common route and so exists in this signed-out state too. It waits out the same guest login, but on
 * the invite's own surface instead of a blank page.
 *
 * Rendering nothing is not a first screen, so this holds the boot cover (and with it the app's launch
 * splash) until it unmounts — when the router rebuilds into the private routes, or the gate leaves
 * for the invite.
 */
const PublicRootEntry = (): JSX.Element => {
    useBootSplashHold();
    return <InviteEntryGate />;
};

export const publicRoutes = [
    { path: ROUTES.root, element: <PublicRootEntry /> },
    // Unknown unauthenticated paths fall back to root and hold there. Redirecting to
    // `/auth/login` would loop via the LoginPage shim (see above).
    { path: '*', element: <Navigate to={ROUTES.root} replace /> },
];
