import { useCallback, useMemo } from 'react';
import { Navigate, RouterProvider, createBrowserRouter } from 'react-router-dom';

import { RouterErrorFallback } from '@chatic/shared';
import { reportError, useWebCoreStore } from '@chatic/web-core';

import { commonRoutes } from './common/CommonRoutes';
import { privateRoutes } from './private/PrivateRoutes';
import { publicRoutes } from './public/PublicRoutes';

export const Router = () => {
    const { isAuthenticated, isInitialized } = useWebCoreStore();

    const handleRouterError = useCallback((error: Error): void => {
        console.error('Router Error:', error);
        reportError(error);
    }, []);

    const router = useMemo(() => {
        const baseRoutes = isAuthenticated
            ? [...privateRoutes, ...commonRoutes, { path: '*', element: <Navigate to="/" replace /> }]
            : [...publicRoutes, ...commonRoutes, { path: '*', element: <Navigate to="/auth/login" replace /> }];

        const routesWithErrorElement = baseRoutes.map(route => ({
            ...route,
            errorElement: <RouterErrorFallback onError={handleRouterError} />,
        }));

        return createBrowserRouter(routesWithErrorElement);
    }, [isAuthenticated, handleRouterError]);

    if (!isInitialized) {
        return null;
    }

    return <RouterProvider router={router} />;
};
