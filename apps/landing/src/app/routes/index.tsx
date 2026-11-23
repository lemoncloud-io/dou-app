import { type JSX, useMemo } from 'react';
import { Navigate, RouterProvider, createBrowserRouter } from 'react-router-dom';

import { isSubscriptionAccountOpen } from '../config/subscriptionServer';

import { type CommonRoutesOptions, createCommonRoutes } from './CommonRoutes';
import { RouteErrorFallback } from './RouteErrorFallback';
import { ROUTES } from './paths';

import type { RouteObject } from 'react-router-dom';

export const createAppRoutes = (options: CommonRoutesOptions): RouteObject[] =>
    [...createCommonRoutes(options), { path: '*', element: <Navigate to={ROUTES.root} /> }].map(route => ({
        ...route,
        errorElement: <RouteErrorFallback />,
    }));

export const appRoutes: RouteObject[] = createAppRoutes({ subscriptionAccount: isSubscriptionAccountOpen });

export const Router = (): JSX.Element => {
    const router = useMemo(() => {
        return createBrowserRouter(appRoutes);
    }, []);

    return <RouterProvider router={router} />;
};
