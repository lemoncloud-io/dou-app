import { type JSX, useMemo } from 'react';
import { Navigate, RouterProvider, createBrowserRouter } from 'react-router-dom';

import { CommonRoutes } from './CommonRoutes';
import { RouteErrorFallback } from './RouteErrorFallback';
import { ROUTES } from './paths';

import type { RouteObject } from 'react-router-dom';

/**
 * The whole route table: every feature's routes, then a catch-all that sends any other path home.
 * Every top-level route carries the same error screen, so a route that throws — a lazy chunk that
 * failed to load, most likely — never falls through to the router's built-in developer screen.
 */
export const appRoutes: RouteObject[] = [
    ...CommonRoutes,
    // A push, not a replace: an unknown path has always left its own history entry behind.
    { path: '*', element: <Navigate to={ROUTES.root} /> },
].map(route => ({ ...route, errorElement: <RouteErrorFallback /> }));

export const Router = (): JSX.Element => {
    const router = useMemo(() => {
        return createBrowserRouter(appRoutes);
    }, []);

    return <RouterProvider router={router} />;
};
