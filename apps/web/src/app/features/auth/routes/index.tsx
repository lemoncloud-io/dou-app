import { Navigate, Route, Routes } from 'react-router-dom';

import { LoginPage, LogoutPage, OAuthResponsePage, TokenLoginPage, TokenTestLoginPage } from '../pages';

export const AuthRoutes = () => {
    return (
        <Routes>
            <Route path="login" element={<LoginPage />} />
            <Route path="token-test-login" element={<TokenTestLoginPage />} />
            <Route path="logout" element={<LogoutPage />} />
            <Route path="oauth-response" element={<OAuthResponsePage />} />
            <Route path="token/:token" element={<TokenLoginPage />} />
            <Route path="*" element={<Navigate to="/auth/login"></Navigate>} />
        </Routes>
    );
};
