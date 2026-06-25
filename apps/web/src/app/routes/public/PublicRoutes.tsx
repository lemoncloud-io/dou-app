import { Navigate } from 'react-router-dom';
import { ROUTES } from '../paths';

export const publicRoutes = [
    { path: ROUTES.root, element: <Navigate to={ROUTES.auth.login} replace /> },
    { path: '*', element: <Navigate to={ROUTES.auth.login} replace /> },
];
