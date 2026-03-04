import { Navigate } from 'react-router-dom';

import { AuthTestRoutes } from '../../features/auth-test';
import { DeeplinksRoutes } from '../../features/deeplinks';
import { PointerTestRoutes } from '../../features/pointer-test';
import { SocketTestRoutes } from '../../features/socket-test';
import { UsersRoutes } from '../../features/users';
import { PrivateLayout } from '../../shared/layouts';

const defaultRoutes = [
    { path: '/', element: <Navigate to="/socket-test" replace /> },
    { path: '/socket-test/*', element: <SocketTestRoutes /> },
    { path: '/auth-test/*', element: <AuthTestRoutes /> },
    { path: '/pointer-test/*', element: <PointerTestRoutes /> },
    { path: '/users/*', element: <UsersRoutes /> },
    { path: '/deeplinks/*', element: <DeeplinksRoutes /> },
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
