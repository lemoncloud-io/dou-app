import { lazy, Suspense } from 'react';

import { DeepLinkRoutes } from '../features/deeplink';
import { HomeRoutes } from '../features/home';

import type { RouteObject } from 'react-router-dom';

// Home and the bounce page ship in the entry chunk. Home is the first screen most visitors see, and
// the bounce page tries the app as soon as it mounts — a chunk fetch in front of that would delay the
// launch on the slowest networks and give an invite link a way to fail it never had. The policy pages
// carry the full legal text and nothing is timed against their mount, so they load on their own.
const PolicyRoutes = lazy(() => import('../features/policy').then(m => ({ default: m.PolicyRoutes })));

// The signed-in surface. Lazy for more than size: its session, data layer and copy live in this chunk,
// so a visitor to the public pages never downloads any of it. This import is the one place the public
// surface reaches into it — on the production host only for the plans page.
const SubscriptionRoutes = lazy(() =>
    import('../features/subscription').then(m => ({ default: m.SubscriptionRoutes }))
);

export interface CommonRoutesOptions {
    /**
     * Register `/subscription/*`. Off on the production host — see `isSubscriptionAccountEnabled` —
     * where `/subscription/plans` alone is registered, listing the plans with nothing to buy yet.
     */
    subscriptionAccount: boolean;
}

export const createCommonRoutes = ({ subscriptionAccount }: CommonRoutesOptions): RouteObject[] => [
    {
        index: true,
        element: <HomeRoutes />,
    },
    {
        path: 's/*',
        element: <DeepLinkRoutes />,
    },
    {
        // Encoded invite links (`/i?t=…`). Without this they fall to the catch-all, which redirects
        // to `/` and drops the token, so a browser that did not hand the link to the app shows the
        // marketing page with no way into the invite.
        path: 'i/*',
        element: <DeepLinkRoutes />,
    },
    {
        path: 'policy/*',
        element: (
            <Suspense fallback={null}>
                <PolicyRoutes />
            </Suspense>
        ),
    },
    // Where the gate is shut only the plans are registered, rather than everything registered and
    // redirecting: any other subscription path is the catch-all's, exactly as before these pages existed.
    subscriptionAccount
        ? {
              path: 'subscription/*',
              element: (
                  <Suspense fallback={null}>
                      <SubscriptionRoutes />
                  </Suspense>
              ),
          }
        : {
              path: 'subscription/plans/*',
              element: (
                  <Suspense fallback={null}>
                      <SubscriptionRoutes account={false} />
                  </Suspense>
              ),
          },
];
