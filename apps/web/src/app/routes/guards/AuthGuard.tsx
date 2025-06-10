import { Navigate, useLocation } from 'react-router-dom';

import { useWebCoreStore } from '@lemon/web-core';

interface AuthGuardProps {
    children: React.ReactNode;
}

export const AuthGuard: React.FC<AuthGuardProps> = ({ children }) => {
    const isAuthenticated = useWebCoreStore(state => state.isAuthenticated);
    const location = useLocation();

    if (!isAuthenticated) {
        return <Navigate to="/" state={{ from: location.pathname }} replace />;
    }

    return <>{children}</>;
};
