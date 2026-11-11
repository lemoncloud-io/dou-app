import { Navigate, Route, Routes } from 'react-router-dom';

import { LoginPage } from './LoginPage';
import { LogoutPage } from './LogoutPage';
import { OAuthResponsePage } from './OAuthResponsePage';

export const AuthRoutes = () => (
    <Routes>
        <Route path="login" element={<LoginPage />} />
        <Route path="logout" element={<LogoutPage />} />
        <Route path="oauth-response" element={<OAuthResponsePage />} />
        <Route path="*" element={<Navigate to="/auth/login" replace />} />
    </Routes>
);
