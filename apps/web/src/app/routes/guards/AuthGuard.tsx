import { Navigate, useLocation } from 'react-router-dom';

import { logger } from '@chatic/bridges';
import { useSessionAuth } from '@chatic/web-core';
import { ROUTES } from '../paths';

interface AuthGuardProps {
    children: React.ReactNode;
}

export const AuthGuard: React.FC<AuthGuardProps> = ({ children }) => {
    const { isAuthenticated } = useSessionAuth();
    const location = useLocation();

    logger.debug('AUTH', 'isAuthenticated', { isAuthenticated });
    if (!isAuthenticated) {
        return <Navigate to={ROUTES.auth.login} state={{ from: location.pathname }} replace />;
    }

    return <>{children}</>;
};
