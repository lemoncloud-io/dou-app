import type { JSX } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { ROUTES } from '../../../routes/paths';

export const LoginPage = (): JSX.Element => {
    const { search } = useLocation();
    return <Navigate to={`${ROUTES.home}${search}`} replace />;
};
