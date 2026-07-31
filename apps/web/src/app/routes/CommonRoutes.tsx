import { AuthRoutes } from '../features/auth';

import { ShareLinkRedirect } from './ShareLinkRedirect';

export const commonRoutes = [
    { path: '/auth/*', element: <AuthRoutes /> },
    // Shared by the signed-in and signed-out route sets: a share link can land in either state, and
    // the redirect must not depend on which. See ShareLinkRedirect for why the web owns `/s` at all.
    { path: '/s', element: <ShareLinkRedirect /> },
];
