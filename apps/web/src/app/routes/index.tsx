import { useCallback, useEffect, useMemo } from 'react';
import { Navigate, RouterProvider, createBrowserRouter } from 'react-router-dom';

import { logger } from '@chatic/bridges';
import { RouterErrorFallback } from '@chatic/shared';
import { runtime } from '@chatic/runtime-react';

import { markBoot } from '../features/debug/metrics/bootMarks';
import { scheduleBootMetricsReport } from '../features/debug/metrics/reportBootMetrics';
import { commonRoutes } from './CommonRoutes';
import { privateRoutes } from './PrivateRoutes';
import { publicRoutes } from './PublicRoutes';
import { ROUTES } from './paths';
import { observeRouterRoutes } from '../navigation';
import { observeScreenViews } from '../runtime/telemetry';
import { bootSplash } from '../runtime/bootSplash';

export const Router = () => {
    const { isAuthenticated, isInitialized } = runtime.session.useSessionAuth();

    useEffect(() => {
        if (!isInitialized) return;
        markBoot('session-initialized');
        scheduleBootMetricsReport();
        bootSplash.markRouteMounted();
    }, [isInitialized]);

    const handleRouterError = useCallback((error: Error): void => {
        logger.error('ROUTER', 'Router Error', { error });
        bootSplash.release('error');
    }, []);

    const router = useMemo(() => {
        const baseRoutes = isAuthenticated
            ? [...privateRoutes, ...commonRoutes, { path: '*', element: <Navigate to={ROUTES.root} replace /> }]
            : [...publicRoutes, ...commonRoutes, { path: '*', element: <Navigate to={ROUTES.auth.login} replace /> }];

        const routesWithErrorElement = baseRoutes.map(route => ({
            ...route,
            errorElement: <RouterErrorFallback onError={handleRouterError} />,
        }));

        return createBrowserRouter(routesWithErrorElement);
    }, [isAuthenticated, handleRouterError]);

    useEffect(() => observeRouterRoutes(router), [router]);
    useEffect(() => observeScreenViews(router), [router]);

    if (!isInitialized) {
        logger.warn('ROUTER', 'Router blocked: isInitialized is false, rendering null');
        return null;
    }

    return <RouterProvider router={router} />;
};
