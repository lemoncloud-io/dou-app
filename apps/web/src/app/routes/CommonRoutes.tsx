import { AuthRoutes } from '../features/auth';
import { InviteAcceptPage } from '../features/invite/accept';

import { EncodedLinkRedirect } from './EncodedLinkRedirect';
import { ShareLinkRedirect } from './ShareLinkRedirect';
import { ROUTES } from './paths';

export const commonRoutes = [
    { path: '/auth/*', element: <AuthRoutes /> },
    { path: '/s', element: <ShareLinkRedirect /> },
    { path: '/i', element: <EncodedLinkRedirect /> },
    { path: ROUTES.invite.accept, element: <InviteAcceptPage /> },
];
