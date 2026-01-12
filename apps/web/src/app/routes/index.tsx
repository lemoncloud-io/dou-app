import { RouterProvider, createBrowserRouter } from 'react-router-dom';

import { AuthRoutes } from '../features/auth';
import { HomeRoutes } from '../features/home';

const router = createBrowserRouter([
    {
        path: '/home/*',
        element: <HomeRoutes />,
    },
    {
        path: '/auth/*',
        element: <AuthRoutes />,
    },
    {
        path: '/*',
        element: <HomeRoutes />,
    },
]);

export const Router = () => {
    return <RouterProvider router={router} />;
};
