import { Route, Routes } from 'react-router-dom';

import {
    ResetPasswordEmailPage,
    ResetPasswordNewPage,
    ResetPasswordVerifyPage,
    SignupEmailPage,
    SignupPasswordPage,
    SignupVerifyPage,
} from '../pages';

export const AccountRoutes = () => {
    return (
        <Routes>
            <Route path="signup" element={<SignupEmailPage />} />
            <Route path="signup/verify" element={<SignupVerifyPage />} />
            <Route path="signup/password" element={<SignupPasswordPage />} />
            <Route path="reset-password" element={<ResetPasswordEmailPage />} />
            <Route path="reset-password/verify" element={<ResetPasswordVerifyPage />} />
            <Route path="reset-password/new-password" element={<ResetPasswordNewPage />} />
        </Routes>
    );
};
