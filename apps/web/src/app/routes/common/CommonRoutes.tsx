import { Navigate } from 'react-router-dom';

import { HomeRoutes } from '../../features/home';
import { PointerTestRoutes } from '../../features/pointer-test';
import { PrivateLayout } from '../../shared/layouts';

export const CommonRoutes = [
    {
        path: '/',
        element: <PrivateLayout />,
        children: [
            { path: '/', element: <HomeRoutes /> },
            { path: '/pointer-test/*', element: <PointerTestRoutes /> },
        ],
    },
    {
        path: '*',
        element: <Navigate to="/" replace />,
    },
];
