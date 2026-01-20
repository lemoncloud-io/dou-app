import { Navigate } from 'react-router-dom';

import { HomeRoutes } from '../../features/home';
import { PrivateLayout } from '../../shared/layouts';

export const CommonRoutes = [
    {
        path: '/',
        element: <PrivateLayout />,
        children: [{ path: '/', element: <HomeRoutes /> }],
    },
    {
        path: '*',
        element: <Navigate to="/" replace />,
    },
];
