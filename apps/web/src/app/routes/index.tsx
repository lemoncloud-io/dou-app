import { useCallback, useEffect, useMemo } from 'react';
import { Navigate, RouterProvider, createBrowserRouter } from 'react-router-dom';

import { logger } from '@chatic/bridges';
import { RouterErrorFallback } from '@chatic/shared';
import { runtime } from '@chatic/app-runtime';

import { markBoot } from '../features/debug/metrics/bootMarks';
import { scheduleBootMetricsReport } from '../features/debug/metrics/reportBootMetrics';
import { commonRoutes } from './CommonRoutes';
import { privateRoutes } from './PrivateRoutes';
import { publicRoutes } from './PublicRoutes';
import { ROUTES } from './paths';
import { observeRouterRoutes } from './routeObserver';

export const Router = () => {
    const { isAuthenticated, isInitialized } = runtime.session.useSessionAuth();

    // Boot timeline: the router unblocking is the moment the first real screen
    // can render (markBoot ignores repeat calls). The native shell gets the
    // completed web snapshot shortly after.
    useEffect(() => {
        if (!isInitialized) return;
        markBoot('session-initialized');
        scheduleBootMetricsReport();
    }, [isInitialized]);

    const handleRouterError = useCallback((error: Error): void => {
        logger.error('ROUTER', 'Router Error', { error });
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

    // Route observers for issue diagnostics: the trail (where the user has been — the feedback
    // screen is reached from MyPage, so its own pathname says nothing about where the bug was hit)
    // and the reconstructed history stack (what the back button will do). Both are fed from one
    // subscription here; see `routeObserver` for why this is the only place that can do it.
    useEffect(() => observeRouterRoutes(router), [router]);

    if (!isInitialized) {
        logger.warn('ROUTER', 'Router blocked: isInitialized is false, rendering null');
        return null;
    }

    return <RouterProvider router={router} />;
};
