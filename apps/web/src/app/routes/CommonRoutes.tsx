import { AuthRoutes } from '../features/auth';
import { InviteAcceptPage } from '../features/invite/accept';

import { EncodedLinkRedirect } from './EncodedLinkRedirect';
import { ShareLinkRedirect } from './ShareLinkRedirect';
import { ROUTES } from './paths';

export const commonRoutes = [
    { path: '/auth/*', element: <AuthRoutes /> },
    // Shared by the signed-in and signed-out route sets: a share link can land in either state, and
    // the redirect must not depend on which. See ShareLinkRedirect for why the web owns `/s` at all.
    { path: '/s', element: <ShareLinkRedirect /> },
    // The same link in its encoded form. Held as a separate route rather than a shared one: the two
    // formats carry the invite differently enough that a single component would have to branch on
    // the query anyway, and `/s` must keep reading `/s` links exactly as it does today.
    { path: '/i', element: <EncodedLinkRedirect /> },
    // Same reason, one step further along: an invite deeplink regularly arrives before the background
    // guest login finishes, and in the signed-out router a private path would fall to the `*`
    // catch-all and lose the query string. Not lazy — this is the invitee's first screen, so there is
    // no chunk fetch to put on that path. It overlaps `invite/*` in privateRoutes but outranks it;
    // inviteAcceptRoute.test.ts pins that down.
    { path: ROUTES.invite.accept, element: <InviteAcceptPage /> },
];
