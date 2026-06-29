import { Navigate, Route, Routes } from 'react-router-dom';

import { LoginPage, LogoutPage, OAuthResponsePage } from '../pages';
import { ROUTES } from '../../../routes/paths';

export const AuthRoutes = () => {
    return (
        <Routes>
            <Route path="login" element={<LoginPage />} />
            <Route path="logout" element={<LogoutPage />} />
            <Route path="oauth-response" element={<OAuthResponsePage />} />
            <Route path="*" element={<Navigate to={ROUTES.auth.login}></Navigate>} />
        </Routes>
    );
};
