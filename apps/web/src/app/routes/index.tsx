import { RouterProvider, createBrowserRouter } from 'react-router-dom';

import { AuthGuard } from './guards';
import { AuthRoutes } from '../features/auth';
import { LogoutPage } from '../features/auth/pages';
import { HomeRoutes } from '../features/home';
import { LandingRoutes } from '../features/landing';

const router = createBrowserRouter([
    {
        path: '/logout',
        element: <LogoutPage />,
    },
    {
        path: '/home/*',
        element: (
            <AuthGuard>
                <HomeRoutes />
            </AuthGuard>
        ),
    },
    {
        path: '/auth/*',
        element: <AuthRoutes />,
    },
    {
        path: '/*',
        element: <LandingRoutes />,
    },
]);

export const Router = () => {
    return <RouterProvider router={router} />;
};
