import { RouterProvider, createBrowserRouter } from 'react-router-dom';

import { useWebCoreStore } from '@chatic/web-core';

import { CommonRoutes } from './common/CommonRoutes';
import { usePrivateRoutes } from './private/usePrivateRoutes';
import { publicRoutes } from './public/PublicRoutes';

export const Router = () => {
    const { isAuthenticated } = useWebCoreStore();
    const privateRoutes = usePrivateRoutes();

    const routes = isAuthenticated ? privateRoutes : publicRoutes;

    const router = createBrowserRouter([...routes, ...CommonRoutes]);

    return <RouterProvider router={router} />;
};
