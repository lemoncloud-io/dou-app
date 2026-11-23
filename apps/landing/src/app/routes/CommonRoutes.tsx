import { lazy, Suspense } from 'react';

import { DeepLinkRoutes, SubWebViewLinkPage } from '../features/deeplink';
import { HomeRoutes } from '../features/home';

import type { RouteObject } from 'react-router-dom';

const PolicyRoutes = lazy(() => import('../features/policy').then(m => ({ default: m.PolicyRoutes })));

const SubscriptionRoutes = lazy(() =>
    import('../features/subscription').then(m => ({ default: m.SubscriptionRoutes }))
);

export interface CommonRoutesOptions {
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
        path: 'i/*',
        element: <DeepLinkRoutes />,
    },
    {
        path: 'apps/*',
        element: <SubWebViewLinkPage />,
    },
    {
        path: 'policy/*',
        element: (
            <Suspense fallback={null}>
                <PolicyRoutes />
            </Suspense>
        ),
    },
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
