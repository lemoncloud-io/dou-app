import { RouterProvider, createBrowserRouter } from 'react-router-dom';

import { AuthGuard } from './guards';
import { AuthRoutes } from '../features/auth';
import { HomeRoutes } from '../features/home';
import { LandingRoutes } from '../features/landing';
import { PublishingRoutes } from '../features/publishing';

const router = createBrowserRouter([
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
        path: '/publishing/*',
        element: <PublishingRoutes />,
    },
    {
        path: '/*',
        element: <LandingRoutes />,
    },
]);

export const Router = () => {
    return <RouterProvider router={router} />;
};
