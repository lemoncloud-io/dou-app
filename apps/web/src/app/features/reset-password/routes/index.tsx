import { Route, Routes } from 'react-router-dom';

import { ResetPasswordEmailPage } from '../pages/ResetPasswordEmailPage';
import { ResetPasswordNewPage } from '../pages/ResetPasswordNewPage';
import { ResetPasswordVerifyPage } from '../pages/ResetPasswordVerifyPage';

export const ResetPasswordRoutes = () => {
    return (
        <Routes>
            <Route index element={<ResetPasswordEmailPage />} />
            <Route path="verify" element={<ResetPasswordVerifyPage />} />
            <Route path="new-password" element={<ResetPasswordNewPage />} />
        </Routes>
    );
};
