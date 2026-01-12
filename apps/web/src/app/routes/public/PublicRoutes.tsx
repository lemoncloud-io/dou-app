import { Navigate, useLocation } from 'react-router-dom';

import { AuthRoutes } from '../../features/auth';
import { PublicLayout } from '../../shared/layouts';

const RedirectToLogin = (): JSX.Element => {
    const location = useLocation();
    return <Navigate to="/auth/login" state={{ from: location.pathname }} replace />;
};

export const publicRoutes = [
    {
        path: '/',
        element: <PublicLayout />,
        children: [
            { index: true, element: <Navigate to="/auth/login" replace /> },
            {
                path: 'auth/*',
                element: <AuthRoutes />,
            },
            {
                path: '*',
                element: <RedirectToLogin />,
            },
        ],
    },
];
