import { useCallback, useMemo } from 'react';
import { RouterProvider, createBrowserRouter } from 'react-router-dom';

import { RouterErrorFallback } from '@chatic/shared';
import { reportError, useWebCoreStore } from '@chatic/web-core';

import { CommonRoutes } from './common/CommonRoutes';
import { usePrivateRoutes } from './private/usePrivateRoutes';
import { publicRoutes } from './public/PublicRoutes';

export const Router = () => {
    const { isAuthenticated, profile } = useWebCoreStore();
    const privateRoutes = usePrivateRoutes();

    const handleRouterError = useCallback(
        (error: Error, info: { componentStack?: string }): void => {
            console.error('Router Error:', error, info);
            reportError(error, info, 'admin', profile?.uid);
        },
        [profile?.uid]
    );

    const routes = isAuthenticated ? privateRoutes : publicRoutes;

    const router = useMemo(() => {
        const routesWithErrorElement = [...routes, ...CommonRoutes].map(route => ({
            ...route,
            errorElement: <RouterErrorFallback onError={handleRouterError} />,
        }));
        return createBrowserRouter(routesWithErrorElement);
    }, [routes, handleRouterError]);

    return <RouterProvider router={router} />;
};
