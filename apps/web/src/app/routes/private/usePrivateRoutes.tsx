import { Navigate } from 'react-router-dom';

import { HomeRoutes } from '../../features/home';
import { PrivateLayout } from '../../shared/layouts';

const defaultRoutes = [{ path: '/', element: <HomeRoutes /> }];

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
