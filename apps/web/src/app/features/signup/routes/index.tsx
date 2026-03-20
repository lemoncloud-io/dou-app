import { Route, Routes } from 'react-router-dom';

import { SignupEmailPage } from '../pages/SignupEmailPage';
import { SignupPasswordPage } from '../pages/SignupPasswordPage';
import { SignupVerifyPage } from '../pages/SignupVerifyPage';

export const SignupRoutes = () => {
    return (
        <Routes>
            <Route index element={<SignupEmailPage />} />
            <Route path="verify" element={<SignupVerifyPage />} />
            <Route path="password" element={<SignupPasswordPage />} />
        </Routes>
    );
};
