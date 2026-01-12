import { Navigate } from 'react-router-dom';

import { DashboardRoutes } from '../../features/dashboard';
import { PrivateLayout } from '../../shared/layouts';

const defaultRoutes = [{ path: '/', element: <DashboardRoutes /> }];

export const usePrivateRoutes = () => {
    const getRoutes = () => {
        return defaultRoutes;
    };

    return [
        {
            path: '/',
            element: <PrivateLayout />,
            children: getRoutes(),
        },
        {
            path: '*',
            element: <Navigate to="/" replace />,
        },
    ];
};
