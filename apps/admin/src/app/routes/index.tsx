import { RouterProvider, createBrowserRouter } from 'react-router-dom';

import { AuthRoutes } from '../features/auth';
import { DashboardRoutes } from '../features/dashboard';

const router = createBrowserRouter([
    {
        path: '/dashboard/*',
        element: <DashboardRoutes />,
    },
    {
        path: '/auth/*',
        element: <AuthRoutes />,
    },
    {
        path: '/*',
        element: <DashboardRoutes />,
    },
]);

export const Router = () => {
    return <RouterProvider router={router} />;
};
