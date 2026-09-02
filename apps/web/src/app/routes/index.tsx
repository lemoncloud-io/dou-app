import { useCallback, useEffect, useMemo } from 'react';
import { Navigate, RouterProvider, createBrowserRouter } from 'react-router-dom';

import { logger } from '@chatic/bridges';
import { RouterErrorFallback } from '@chatic/shared';
import { useSessionAuth } from '@chatic/app-runtime';

import { markBoot } from '../features/debug/metrics/bootMarks';
import { scheduleBootMetricsReport } from '../features/debug/metrics/reportBootMetrics';
import { recordRoute } from '../utils/routeTrail';
import { commonRoutes } from './CommonRoutes';
import { privateRoutes } from './PrivateRoutes';
import { publicRoutes } from './PublicRoutes';
import { ROUTES } from './paths';

export const Router = () => {
    const { isAuthenticated, isInitialized } = useSessionAuth();

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

    // Route trail for issue diagnostics: the feedback screen is reached from MyPage, so its own
    // pathname says nothing about where the user hit the problem. Subscribing to the data router
    // (rather than a `useLocation` runner) is the only option here — AppRuntime sits ABOVE
    // RouterProvider, so there is no router context to hook into outside this component. `subscribe`
    // does not replay the current state, hence the explicit first record.
    useEffect(() => {
        recordRoute(router.state.location.pathname);
        return router.subscribe(state => recordRoute(state.location.pathname));
    }, [router]);

    if (!isInitialized) {
        logger.warn('ROUTER', 'Router blocked: isInitialized is false, rendering null');
        return null;
    }

    return <RouterProvider router={router} />;
};
