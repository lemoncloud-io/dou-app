import { Navigate, useLocation } from 'react-router-dom';

import { AuthRoutes } from '../../features/auth';
import { SafeAreaLayout } from '../../shared/layouts';
import type { JSX } from 'react';

const RedirectToLogin = (): JSX.Element => {
    const location = useLocation();
    return <Navigate to="/auth/login" state={{ from: location.pathname }} replace />;
};

export const publicRoutes = [
    {
        path: '/',
        element: <SafeAreaLayout />,
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
