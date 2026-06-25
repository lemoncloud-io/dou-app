import { useCallback, useMemo } from 'react';
import { Navigate, RouterProvider, createBrowserRouter } from 'react-router-dom';

import { logger } from '@chatic/bridges';
import { RouterErrorFallback } from '@chatic/shared';
import { reportError, useSessionAuth } from '@chatic/web-core';

import { commonRoutes } from './CommonRoutes';
import { privateRoutes } from './PrivateRoutes';
import { publicRoutes } from './PublicRoutes';
import { GlobalBridgeListener } from '../bridge';
import { ROUTES } from './paths';

export const Router = () => {
    const { isAuthenticated, isInitialized } = useSessionAuth();

    const handleRouterError = useCallback((error: Error): void => {
        logger.error('ROUTER', 'Router Error', { error });
        reportError(error);
    }, []);

    const router = useMemo(() => {
        const baseRoutes = isAuthenticated
            ? [...privateRoutes, ...commonRoutes, { path: '*', element: <Navigate to={ROUTES.root} replace /> }]
            : [...publicRoutes, ...commonRoutes, { path: '*', element: <Navigate to={ROUTES.auth.login} replace /> }];

        const wrappedRoutes = [
            {
                element: <GlobalBridgeListener />,
                children: baseRoutes,
            },
        ];

        const routesWithErrorElement = wrappedRoutes.map(route => ({
            ...route,
            errorElement: <RouterErrorFallback onError={handleRouterError} />,
        }));

        return createBrowserRouter(routesWithErrorElement);
    }, [isAuthenticated, handleRouterError]);

    if (!isInitialized) {
        logger.warn('ROUTER', 'Router blocked: isInitialized is false, rendering null');
        return null;
    }

    return <RouterProvider router={router} />;
};
