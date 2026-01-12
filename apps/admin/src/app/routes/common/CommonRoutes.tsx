import { Navigate } from 'react-router-dom';

export const CommonRoutes = [
    {
        path: '*',
        element: <Navigate to="/" replace />,
    },
];
