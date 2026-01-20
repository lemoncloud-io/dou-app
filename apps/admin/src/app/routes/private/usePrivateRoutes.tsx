import { Navigate } from 'react-router-dom';

import { SocketTestRoutes } from '../../features/socket-test';
import { PrivateLayout } from '../../shared/layouts';

const defaultRoutes = [
    { path: '/', element: <Navigate to="/socket-test" replace /> },
    { path: '/socket-test/*', element: <SocketTestRoutes /> },
];

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
            element: <Navigate to="/socket-test" replace />,
        },
    ];
};
