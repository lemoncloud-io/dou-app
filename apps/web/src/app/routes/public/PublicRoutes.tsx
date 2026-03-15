import { Navigate } from 'react-router-dom';

export const publicRoutes = [
    { path: '/', element: <Navigate to="/auth/login" replace /> },
    { path: '*', element: <Navigate to="/auth/login" replace /> },
];
