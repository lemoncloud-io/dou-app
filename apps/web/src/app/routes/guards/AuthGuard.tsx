import { Navigate, useLocation } from 'react-router-dom';

import { useWebCoreStore } from '@chatic/web-core';

interface AuthGuardProps {
    children: React.ReactNode;
}

export const AuthGuard: React.FC<AuthGuardProps> = ({ children }) => {
    const isAuthenticated = useWebCoreStore(state => state.isAuthenticated);
    const location = useLocation();

    console.log('isAuthenticated', isAuthenticated);
    if (!isAuthenticated) {
        return <Navigate to="/auth/login" state={{ from: location.pathname }} replace />;
    }

    return <>{children}</>;
};
