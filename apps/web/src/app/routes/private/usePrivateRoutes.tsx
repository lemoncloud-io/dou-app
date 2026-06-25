import { Navigate } from 'react-router-dom';

import { HomeRoutes } from '../../features/home';
import { PrivateLayout } from '../../shared/layouts';
import { ROUTES } from '../paths';

const defaultRoutes = [{ path: ROUTES.root, element: <HomeRoutes /> }];

export const usePrivateRoutes = () => {
    const getRoutes = () => {
        return defaultRoutes;
    };

    return [
        {
            path: ROUTES.root,
            element: <PrivateLayout />,
            children: getRoutes(),
        },
        {
            path: '*',
            element: <Navigate to={ROUTES.root} replace />,
        },
    ];
};
